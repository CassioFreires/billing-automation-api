import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { applyDiscount, isDiscountActive } from '../domain/save-offer.js';
import type { CashflowItem } from '../domain/cashflow.js';

const OPEN_STATUSES = ['PENDING', 'OVERDUE'];

/** Lê o atraso médio do cliente do score do Radar (F2), guardado em ClientHealth.signals. */
function avgLateFrom(health: { signals?: unknown } | null | undefined): number {
  const s = (health?.signals ?? null) as { avgDaysLate?: number } | null;
  return typeof s?.avgDaysLate === 'number' ? s.avgDaysLate : 0;
}

/**
 * Previsão de Caixa (spec 0039, F4). Reúne os itens que vão (ou deveriam) entrar na
 * janela: faturas em aberto + faturas que as assinaturas ativas vão gerar (com
 * desconto ativo aplicado), cada uma com a faixa/atraso do cliente (Radar/F2).
 */
export class ForecastRepository {
  async findInputs(now: Date, until: Date): Promise<CashflowItem[]> {
    const tenantId = requireTenantId();

    const [invoices, subs] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId, status: { in: OPEN_STATUSES }, dueDate: { lt: until } },
        select: { value: true, dueDate: true, client: { select: { health: { select: { band: true, signals: true } } } } },
      }),
      prisma.subscription.findMany({
        where: { tenantId, status: 'ACTIVE', nextRunDate: { gte: now, lt: until } },
        select: {
          amount: true,
          nextRunDate: true,
          discountPercent: true,
          discountUntil: true,
          client: { select: { health: { select: { band: true, signals: true } } } },
        },
      }),
    ]);

    const items: CashflowItem[] = [];

    for (const inv of invoices) {
      items.push({
        amount: Number(inv.value),
        dueDate: inv.dueDate,
        band: inv.client?.health?.band ?? null,
        avgDaysLate: avgLateFrom(inv.client?.health),
      });
    }

    for (const s of subs) {
      const gross = Number(s.amount);
      const amount = isDiscountActive(s.discountUntil, s.nextRunDate)
        ? applyDiscount(gross, s.discountPercent)
        : gross;
      items.push({
        amount,
        dueDate: s.nextRunDate,
        band: s.client?.health?.band ?? null,
        avgDaysLate: avgLateFrom(s.client?.health),
      });
    }

    return items;
  }
}
