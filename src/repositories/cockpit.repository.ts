import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { InvoiceStatus } from '../domain/status.js';
import { InteractionType } from '../domain/interaction.js';
import { OpenInvoice } from '../domain/cockpit.js';

/** Faturas "em aberto" = não pagas (PENDING + OVERDUE). */
const OPEN_STATUSES = [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE];

/** Leituras agregadas do Cockpit (M4, spec 0017). Somente leitura, por tenant. */
export class CockpitRepository {
  /** Faturas em aberto do tenant (dados mínimos para KPIs/aging/ações). */
  async findOpenInvoices(): Promise<OpenInvoice[]> {
    const tenantId = requireTenantId();
    const rows = await prisma.invoice.findMany({
      where: { tenantId, status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        value: true,
        dueDate: true,
        client: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      value: Number(r.value), // Decimal → number (métrica; RN-CKP6)
      dueDate: r.dueDate,
      clientName: r.client?.name ?? '—',
    }));
  }

  /** Soma dos recebimentos (Payment) desde `since` — fonte única do M1. */
  async sumReceivedSince(since: Date): Promise<number> {
    const tenantId = requireTenantId();
    const agg = await prisma.payment.aggregate({
      where: { tenantId, paidAt: { gte: since } },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  /**
   * "Valor recuperado" (spec 0025): soma dos recebimentos desde `since` cujo
   * pagamento entrou APÓS o vencimento da fatura (paidAt > dueDate) — ou seja,
   * inadimplência que virou caixa. É a prova de ROI do Adimplo. Comparação
   * entre duas colunas → filtra em memória (volume por tenant/período é baixo).
   */
  async sumRecoveredSince(since: Date): Promise<number> {
    const tenantId = requireTenantId();
    const payments = await prisma.payment.findMany({
      where: { tenantId, paidAt: { gte: since } },
      select: { amount: true, paidAt: true, invoice: { select: { dueDate: true } } },
    });
    let total = 0;
    for (const p of payments) {
      if (p.invoice && p.paidAt.getTime() > p.invoice.dueDate.getTime()) {
        total += Number(p.amount);
      }
    }
    return total;
  }

  /** Contagem de faturas por status. */
  async countByStatus(): Promise<Record<string, number>> {
    const tenantId = requireTenantId();
    const rows = await prisma.invoice.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }

  /**
   * Faturas HESITANDO (RN-CKP5, do Elo): não pagas, com `open >= threshold` e
   * sem `paid`. O "sem paid" é garantido pelo filtro de status (só em aberto).
   */
  async findHesitating(
    threshold: number
  ): Promise<{ invoiceId: string; clientName: string; value: number; opens: number }[]> {
    const tenantId = requireTenantId();

    // 1) faturas com contagem de aberturas >= limiar
    const groups = await prisma.interactionEvent.groupBy({
      by: ['invoiceId'],
      where: { tenantId, type: InteractionType.OPEN, invoiceId: { not: null } },
      _count: { invoiceId: true },
      having: { invoiceId: { _count: { gte: threshold } } },
    });

    const ids = groups.map((g) => g.invoiceId).filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    const opensById = new Map(groups.map((g) => [g.invoiceId as string, g._count.invoiceId]));

    // 2) só as que ainda estão EM ABERTO (exclui as já pagas)
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, id: { in: ids }, status: { in: OPEN_STATUSES } },
      select: { id: true, value: true, client: { select: { name: true } } },
    });

    return invoices
      .map((inv) => ({
        invoiceId: inv.id,
        clientName: inv.client?.name ?? '—',
        value: Number(inv.value),
        opens: opensById.get(inv.id) ?? 0,
      }))
      .sort((a, b) => b.opens - a.opens);
  }
}
