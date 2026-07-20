/**
 * Cálculos PUROS do Cockpit (M4, spec 0017). Sem banco, sem I/O — testáveis
 * isoladamente. O repositório busca os dados; aqui só transformamos.
 */

export interface OpenInvoice {
  id: string;
  value: number;
  dueDate: Date;
  clientName: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Arredonda para 2 casas (métrica de exibição; dinheiro exato mora em Decimal). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Dias de atraso a partir do vencimento (negativo = ainda a vencer). */
export function daysOverdue(dueDate: Date, now: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);
}

export type AgingKey = 'aVencer' | 'd0a30' | 'd31a60' | 'd60mais';

/** Balde de aging por dias de atraso (RN-CKP3). */
export function agingBucket(dueDate: Date, now: Date): AgingKey {
  const d = daysOverdue(dueDate, now);
  if (d < 0) return 'aVencer';
  if (d <= 30) return 'd0a30';
  if (d <= 60) return 'd31a60';
  return 'd60mais';
}

export interface OpenSummary {
  aReceber: number; // tudo não pago
  aVencer: number; // não pago, dueDate >= hoje
  emAtraso: number; // não pago, dueDate < hoje
  aging: Record<AgingKey, number>;
}

/** KPIs + aging a partir das faturas em aberto (RN-CKP2/RN-CKP3). */
export function summarizeOpenInvoices(open: OpenInvoice[], now: Date): OpenSummary {
  const aging: Record<AgingKey, number> = { aVencer: 0, d0a30: 0, d31a60: 0, d60mais: 0 };
  let aReceber = 0;
  let aVencer = 0;
  let emAtraso = 0;

  for (const inv of open) {
    aReceber += inv.value;
    const bucket = agingBucket(inv.dueDate, now);
    aging[bucket] += inv.value;
    if (bucket === 'aVencer') aVencer += inv.value;
    else emAtraso += inv.value;
  }

  return { aReceber, aVencer, emAtraso, aging };
}

/** Taxa de inadimplência (0..1), protegida contra divisão por zero (RN-CKP6). */
export function inadimplenciaRate(emAtraso: number, aReceber: number): number {
  if (aReceber <= 0) return 0;
  return emAtraso / aReceber;
}

/** Faturas que vencem nos próximos `days` dias (a partir de hoje), ordenadas. */
export function dueWithinDays(open: OpenInvoice[], now: Date, days: number): OpenInvoice[] {
  const from = now.getTime();
  const to = from + days * DAY_MS;
  return open
    .filter((i) => i.dueDate.getTime() >= from && i.dueDate.getTime() <= to)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
