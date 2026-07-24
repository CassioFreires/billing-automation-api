import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import type { HealthInput } from '../domain/health-score.js';

const DAY_MS = 86_400_000;
const OPEN_STATUSES = ['PENDING', 'OVERDUE'];

/** Entrada do domínio + o clientId a que pertence. */
export interface ClientHealthInput {
  clientId: string;
  input: HealthInput;
}

/**
 * Radar de Risco (spec 0035, F2) — leitura dos sinais e persistência do score.
 * Agrega, por cliente: histórico de pagamento (faturas pagas/vencidas), eventos
 * do Elo (open/pay_attempt/paid) e casos de recuperação perdidos. Tudo escopado
 * por tenant (RN-3507).
 */
export class ClientHealthRepository {
  /** Sinais de TODOS os clientes do tenant (para o sweep). `clientId` opcional foca em um. */
  async aggregateInputs(now: Date, clientId?: string): Promise<ClientHealthInput[]> {
    const tenantId = requireTenantId();
    const clientFilter = clientId ? { id: clientId } : {};
    const invClientFilter = clientId ? { clientId } : {};

    const [clients, invoices, eventRows, lostRows] = await Promise.all([
      prisma.client.findMany({ where: { tenantId, ...clientFilter }, select: { id: true } }),
      prisma.invoice.findMany({
        where: { tenantId, ...invClientFilter },
        select: { clientId: true, status: true, dueDate: true, paidAt: true, subscriptionId: true },
        orderBy: { paidAt: 'asc' }, // paidDaysLate em ordem cronológica de pagamento
      }),
      prisma.interactionEvent.groupBy({
        by: ['clientId', 'type'],
        where: { tenantId, type: { in: ['open', 'pay_attempt', 'paid'] }, clientId: { not: null }, ...invClientFilter },
        _count: { _all: true },
      }),
      prisma.recoveryCase.groupBy({
        by: ['clientId'],
        where: { tenantId, status: 'lost', ...invClientFilter },
        _count: { _all: true },
      }),
    ]);

    // Base: todo cliente entra (mesmo sem dados → neutro no domínio).
    const map = new Map<string, HealthInput>();
    for (const c of clients) map.set(c.id, blankInput());

    for (const inv of invoices) {
      const acc = map.get(inv.clientId);
      if (!acc) continue;
      const overdue = OPEN_STATUSES.includes(inv.status) && inv.dueDate < now;
      if (inv.status === 'PAID' && inv.paidAt) {
        const late = Math.max(0, Math.floor((inv.paidAt.getTime() - inv.dueDate.getTime()) / DAY_MS));
        acc.paidDaysLate.push(late);
      } else if (overdue) {
        acc.openOverdueCount += 1;
        const daysOver = Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY_MS));
        if (daysOver > acc.maxDaysOverdue) acc.maxDaysOverdue = daysOver;
        if (inv.subscriptionId) acc.missedRecurring += 1;
      }
    }

    for (const row of eventRows) {
      const acc = row.clientId ? map.get(row.clientId) : undefined;
      if (!acc) continue;
      const n = row._count._all;
      if (row.type === 'open') acc.opens += n;
      else acc.paysOrAttempts += n; // paid + pay_attempt
    }

    for (const row of lostRows) {
      const acc = map.get(row.clientId);
      if (acc) acc.lostCases += row._count._all;
    }

    return Array.from(map.entries()).map(([id, input]) => ({ clientId: id, input }));
  }

  /** Upsert idempotente do score do cliente (1:1 por clientId — RN-3508). */
  async upsert(
    clientId: string,
    tenantId: string,
    data: { score: number; band: string; signals: unknown }
  ) {
    const signals = data.signals as Prisma.InputJsonValue;
    return prisma.clientHealth.upsert({
      where: { clientId },
      create: { clientId, tenantId, score: data.score, band: data.band, signals, computedAt: new Date() },
      update: { score: data.score, band: data.band, signals, computedAt: new Date() },
    });
  }
}

function blankInput(): HealthInput {
  return {
    paidDaysLate: [],
    openOverdueCount: 0,
    maxDaysOverdue: 0,
    missedRecurring: 0,
    opens: 0,
    paysOrAttempts: 0,
    lostCases: 0,
  };
}
