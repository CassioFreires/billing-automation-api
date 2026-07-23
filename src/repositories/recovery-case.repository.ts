import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Repositório dos casos de recuperação (spec 0033 — F1). Único ponto de acesso a
 * `RecoveryCase`/`RecoveryAttempt`. Leituras do sweep são escopadas por tenant
 * (`requireTenantId`, dentro de `runWithTenant`); o fechamento por webhook resolve
 * pela fatura (invoiceId é único global), sem exigir contexto de tenant.
 */

export interface OverdueInvoiceForRecovery {
  id: string;
  value: number;
  dueDate: Date;
  subscriptionId: string | null;
  clientId: string;
  clientName: string;
  phone: string;
  document: string;
  hasEmail: boolean;
}

export interface DueRecoveryCase {
  id: string;
  currentStep: number;
  lastChannel: string | null;
  reliefOffered: boolean;
  invoice: {
    id: string;
    status: string;
    value: number;
    clientName: string;
    phone: string;
    document: string;
    hasEmail: boolean;
  };
}

export class RecoveryCaseRepository {
  /** Faturas vencidas do tenant atual SEM caso ainda — candidatas a abrir (RN-3301). */
  async findOverdueWithoutCase(now: Date, limit = 500): Promise<OverdueInvoiceForRecovery[]> {
    const tenantId = requireTenantId();
    const rows = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lt: now },
        recoveryCase: { is: null },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
      select: {
        id: true,
        value: true,
        dueDate: true,
        subscriptionId: true,
        clientId: true,
        client: { select: { name: true, phone: true, document: true, email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      value: Number(r.value),
      dueDate: r.dueDate,
      subscriptionId: r.subscriptionId,
      clientId: r.clientId,
      clientName: r.client.name,
      phone: r.client.phone,
      document: r.client.document,
      hasEmail: Boolean(r.client.email),
    }));
  }

  /** Abre um caso (idempotente por `invoiceId` @unique — RN-3301). */
  async openCase(params: {
    invoiceId: string;
    clientId: string;
    subscriptionId: string | null;
    amountAtRisk: number;
    nextActionAt: Date;
    tenantId: string;
  }) {
    return prisma.recoveryCase.upsert({
      where: { invoiceId: params.invoiceId },
      create: {
        invoiceId: params.invoiceId,
        clientId: params.clientId,
        subscriptionId: params.subscriptionId,
        amountAtRisk: params.amountAtRisk,
        nextActionAt: params.nextActionAt,
        tenantId: params.tenantId,
      },
      update: {}, // já existe → não mexe (idempotente)
    });
  }

  /** Casos devidos do tenant atual (open/recovering, nextActionAt<=now ou null). */
  async findDueCases(now: Date, limit = 500): Promise<DueRecoveryCase[]> {
    const tenantId = requireTenantId();
    const rows = await prisma.recoveryCase.findMany({
      where: {
        tenantId,
        status: { in: ['open', 'recovering'] },
        OR: [{ nextActionAt: { lte: now } }, { nextActionAt: null }],
      },
      orderBy: { nextActionAt: 'asc' },
      take: limit,
      select: {
        id: true,
        currentStep: true,
        lastChannel: true,
        reliefOffered: true,
        invoice: {
          select: {
            id: true,
            status: true,
            value: true,
            client: { select: { name: true, phone: true, document: true, email: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      currentStep: r.currentStep,
      lastChannel: r.lastChannel,
      reliefOffered: r.reliefOffered,
      invoice: {
        id: r.invoice.id,
        status: r.invoice.status,
        value: Number(r.invoice.value),
        clientName: r.invoice.client.name,
        phone: r.invoice.client.phone,
        document: r.invoice.client.document,
        hasEmail: Boolean(r.invoice.client.email),
      },
    }));
  }

  /** Registra a tentativa e avança o caso (transação atômica). */
  async recordAttemptAndAdvance(params: {
    caseId: string;
    tenantId: string;
    step: number;
    channel: string | null;
    action: string;
    result: string;
    reliefOffered: boolean;
    nextActionAt: Date;
  }) {
    await prisma.$transaction(async (tx) => {
      await tx.recoveryAttempt.create({
        data: {
          caseId: params.caseId,
          tenantId: params.tenantId,
          step: params.step,
          channel: params.channel,
          action: params.action,
          result: params.result,
        },
      });
      await tx.recoveryCase.update({
        where: { id: params.caseId },
        data: {
          status: 'recovering',
          currentStep: params.step,
          lastChannel: params.channel,
          reliefOffered: params.reliefOffered,
          nextActionAt: params.nextActionAt,
        },
      });
    });
  }

  /** Encerra o caso como perdido — passos esgotados (RN-3307). */
  async markLost(caseId: string) {
    return prisma.recoveryCase.update({
      where: { id: caseId },
      data: { status: 'lost', outcome: 'sem_resposta', resolvedAt: new Date(), nextActionAt: null },
    });
  }

  /**
   * Fecha o caso de uma fatura (RN-3306). Cross-tenant safe: resolve por invoiceId
   * (único global), sem exigir contexto de tenant — chamado pelo webhook/acordo.
   * Idempotente: se não há caso ou já está resolvido, não faz nada.
   */
  async closeByInvoiceId(
    invoiceId: string,
    outcome: 'paid' | 'agreement'
  ): Promise<{ closed: boolean }> {
    const existing = await prisma.recoveryCase.findUnique({
      where: { invoiceId },
      select: { status: true },
    });
    if (!existing || ['recovered', 'lost', 'cancelled'].includes(existing.status)) {
      return { closed: false };
    }
    await prisma.recoveryCase.update({
      where: { invoiceId },
      data: { status: 'recovered', outcome, resolvedAt: new Date(), nextActionAt: null },
    });
    return { closed: true };
  }
}
