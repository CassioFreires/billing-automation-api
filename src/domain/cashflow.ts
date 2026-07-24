/**
 * Previsão de Caixa (spec 0039, F4). Função PURA: projeta a entrada de caixa dos
 * próximos `days` dias em baldes semanais, com duas linhas:
 *  - esperado: o que está agendado (bruto);
 *  - provável: o esperado ponderado pela chance de pagar de CADA cliente (não uma
 *    média cega) — faixa do Radar (F2) × fator de atraso médio.
 */

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

export interface CashflowItem {
  amount: number;
  dueDate: Date;
  band: string | null; // faixa do Radar: healthy | watch | at_risk | null
  avgDaysLate: number; // atraso médio do cliente (0 se sem histórico)
}

export interface CashflowBucket {
  de: Date;
  ate: Date;
  label: string;
  esperado: number;
  provavel: number;
}

export interface CashflowForecast {
  total: { esperado: number; provavel: number; confianca: number }; // confianca 0..1
  baldes: CashflowBucket[];
}

/**
 * Chance (0..1) de o pagamento entrar, por regra transparente (RN-3904): base pela
 * faixa de saúde × fator que decai com o atraso médio (satura em ~60 dias).
 */
export function payProbability(band: string | null, avgDaysLate: number): number {
  const base = band === 'healthy' ? 0.95 : band === 'watch' ? 0.75 : band === 'at_risk' ? 0.45 : 0.8;
  const latenessFactor = clamp(1 - Math.max(avgDaysLate, 0) / 60, 0.4, 1);
  return round2(base * latenessFactor);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Índice do balde (0..n-1) para uma data; vencidas (antes de `now`) caem no balde 0. */
function bucketIndex(now: Date, dueDate: Date, count: number): number {
  const diffDays = Math.floor((dueDate.getTime() - now.getTime()) / DAY_MS);
  if (diffDays < 0) return 0; // vencida → 1º balde (RN-3903)
  return Math.min(Math.floor(diffDays / WEEK_DAYS), count - 1);
}

/**
 * Projeta o fluxo. Itens com `dueDate` além da janela são ignorados. `now`/`days`
 * injetáveis para teste.
 */
export function projectCashflow(
  items: CashflowItem[],
  now: Date = new Date(),
  days = 30
): CashflowForecast {
  const count = Math.max(1, Math.ceil(days / WEEK_DAYS));
  const baldes: CashflowBucket[] = Array.from({ length: count }, (_, i) => {
    const de = new Date(now.getTime() + i * WEEK_DAYS * DAY_MS);
    const ate = new Date(now.getTime() + Math.min((i + 1) * WEEK_DAYS, days) * DAY_MS);
    return { de, ate, label: `Semana ${i + 1}`, esperado: 0, provavel: 0 };
  });

  const windowEnd = now.getTime() + days * DAY_MS;

  for (const it of items) {
    if (it.dueDate.getTime() > windowEnd) continue; // fora da janela
    const idx = bucketIndex(now, it.dueDate, count);
    const prob = payProbability(it.band, it.avgDaysLate);
    baldes[idx].esperado = round2(baldes[idx].esperado + it.amount);
    baldes[idx].provavel = round2(baldes[idx].provavel + it.amount * prob);
  }

  const esperado = round2(baldes.reduce((s, b) => s + b.esperado, 0));
  const provavel = round2(baldes.reduce((s, b) => s + b.provavel, 0));
  const confianca = esperado > 0 ? round2(provavel / esperado) : 0;

  return { total: { esperado, provavel, confianca }, baldes };
}
