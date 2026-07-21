import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { canTransitionInvoice, InvoiceStatus } from '../domain/status.js';
import { InteractionType } from '../domain/interaction.js';
import { AgreementTerms } from '../domain/negotiation.js';

/** Acesso aos acordos de autonegociação (spec 0018 — M2). Escopo por tenant. */
export class AgreementRepository {
  /** Acordo ATIVO (PENDING) de uma fatura original, se houver (RN-NEG3). */
  async findActiveByOriginal(originalInvoiceId: string) {
    return prisma.agreement.findFirst({
      where: {
        originalInvoiceId,
        status: 'PENDING',
        tenantId: requireTenantId(),
      },
      include: {
        newInvoice: {
          select: { id: true, value: true, dueDate: true, linkToken: true, checkoutUrl: true, pixCopyPaste: true },
        },
      },
    });
  }

  /** Acordo mais recente de uma fatura (para o painel). */
  async findByOriginal(originalInvoiceId: string) {
    return prisma.agreement.findFirst({
      where: { originalInvoiceId, tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
      include: {
        newInvoice: {
          select: { id: true, value: true, dueDate: true, status: true, linkToken: true },
        },
      },
    });
  }

  /**
   * Finaliza o acordo de forma ATÔMICA: transiciona a fatura ORIGINAL para
   * RENEGOTIATED, cria o Agreement (PENDING) e registra os eventos do Elo
   * (relief_accepted na original, link_created na nova). A nova fatura já foi
   * reservada + cobrada FORA da transação (chamada de gateway não pode ficar
   * dentro de $transaction).
   *
   * Guarda de corrida (RN-NEG3): se a original já não puder ir para RENEGOTIATED
   * (outro aceite ganhou / já paga), retorna `{ conflict: true }` e o caller
   * desfaz a nova fatura reservada.
   */
  async finalize(params: {
    tenantId: string;
    clientId: string;
    originalInvoiceId: string;
    newInvoiceId: string;
    type: string;
    terms: AgreementTerms;
  }): Promise<{ conflict: boolean; agreement: unknown }> {
    return prisma.$transaction(async (tx) => {
      const original = await tx.invoice.findUnique({ where: { id: params.originalInvoiceId } });
      if (!original || !canTransitionInvoice(original.status, InvoiceStatus.RENEGOTIATED)) {
        const existing = await tx.agreement.findFirst({
          where: { originalInvoiceId: params.originalInvoiceId, status: 'PENDING' },
          include: {
            newInvoice: {
              select: { id: true, value: true, dueDate: true, linkToken: true, checkoutUrl: true, pixCopyPaste: true },
            },
          },
        });
        return { conflict: true, agreement: existing };
      }

      await tx.invoice.update({
        where: { id: params.originalInvoiceId },
        data: { status: InvoiceStatus.RENEGOTIATED },
      });

      const agreement = await tx.agreement.create({
        data: {
          tenantId: params.tenantId,
          originalInvoiceId: params.originalInvoiceId,
          newInvoiceId: params.newInvoiceId,
          type: params.type,
          status: 'PENDING',
          terms: params.terms as unknown as Prisma.InputJsonValue,
        },
        include: {
          newInvoice: {
            select: { id: true, value: true, dueDate: true, linkToken: true, checkoutUrl: true, pixCopyPaste: true },
          },
        },
      });

      // Elo (spec 0016): o pagador aceitou o alívio na original; a nova cobrança nasce.
      await tx.interactionEvent.create({
        data: {
          type: InteractionType.RELIEF_ACCEPTED,
          tenantId: params.tenantId,
          invoiceId: params.originalInvoiceId,
          clientId: params.clientId,
          occurredAt: new Date(),
        },
      });
      await tx.interactionEvent.create({
        data: {
          type: InteractionType.LINK_CREATED,
          tenantId: params.tenantId,
          invoiceId: params.newInvoiceId,
          clientId: params.clientId,
          occurredAt: new Date(),
        },
      });

      return { conflict: false, agreement };
    });
  }
}
