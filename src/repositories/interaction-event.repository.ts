import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Repositório dos eventos de interação (spec 0016 — Fundação "Elo").
 * Append-only: só grava e lê, nunca edita/apaga um evento.
 */
export class InteractionEventRepository {
  /**
   * Registra um evento. O `tenantId` é EXPLÍCITO (não vem do contexto), porque
   * o produtor pode estar FORA de um contexto de tenant — a rota pública
   * `/r/:token` e o webhook resolvem o tenant pela própria fatura (RN-ELO4),
   * igual ao `applyWebhookAtomic`. `tx` opcional grava dentro de uma transação.
   */
  async record(
    params: {
      type: string;
      tenantId: string;
      invoiceId?: string | null;
      clientId?: string | null;
      channel?: string | null;
      metadata?: Prisma.InputJsonValue;
      occurredAt?: Date;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return db.interactionEvent.create({
      data: {
        type: params.type,
        tenantId: params.tenantId,
        invoiceId: params.invoiceId ?? null,
        clientId: params.clientId ?? null,
        channel: params.channel ?? null,
        metadata: params.metadata,
        occurredAt: params.occurredAt ?? new Date(),
      },
    });
  }

  /** Eventos de uma fatura do tenant atual (mais recentes primeiro). */
  async listByInvoice(invoiceId: string) {
    return prisma.interactionEvent.findMany({
      where: { invoiceId, tenantId: requireTenantId() },
      orderBy: { occurredAt: 'desc' },
      select: { type: true, channel: true, occurredAt: true, metadata: true },
    });
  }

  /**
   * Contagem por tipo de evento de uma fatura, do tenant atual. Alimenta as
   * regras da régua (Botão de Alívio, M2) e o Cockpit (M4).
   */
  async countsByInvoice(invoiceId: string): Promise<Record<string, number>> {
    const rows = await prisma.interactionEvent.groupBy({
      by: ['type'],
      where: { invoiceId, tenantId: requireTenantId() },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.type] = row._count._all;
    }
    return counts;
  }
}
