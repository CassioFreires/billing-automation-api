/**
 * Radar de Risco — score de saúde do cliente (spec 0035, F2).
 *
 * Função PURA e transparente (v1 por regras, sem ML): parte de 100 e subtrai
 * penalidades por sinal de risco. Documentada e testável — o `signals` devolvido
 * explica o "porquê" do score (alimenta o alerta da Lista do Dia, F3).
 *
 * Vale para os dois modos (RN-3506): recorrente = risco de churn; avulso = risco
 * de calote na cobrança atual. É o mesmo score, lido conforme o contexto.
 */

export type HealthBand = 'healthy' | 'watch' | 'at_risk';

export interface HealthInput {
  /** Dias de atraso (>=0) das faturas PAGAS, em ordem cronológica de pagamento. */
  paidDaysLate: number[];
  /** Faturas em aberto já vencidas hoje (PENDING/OVERDUE, dueDate < now). */
  openOverdueCount: number;
  /** Maior atraso atual em dias (da fatura vencida mais antiga em aberto). */
  maxDaysOverdue: number;
  /** Faturas RECORRENTES vencidas e não pagas (churn involuntário em curso). */
  missedRecurring: number;
  /** Eventos `open` do Elo (abriu o link de cobrança). */
  opens: number;
  /** Eventos `paid` + `pay_attempt` do Elo (sinal de intenção de pagar). */
  paysOrAttempts: number;
  /** Casos de recuperação encerrados como perdidos (`lost`). */
  lostCases: number;
}

export interface HealthSignals {
  avgDaysLate: number;
  trendUp: boolean;
  missedRecurring: number;
  openOverdue: number;
  maxDaysOverdue: number;
  opensNoPay: boolean;
  lostCases: number;
  hasHistory: boolean;
}

export interface HealthResult {
  score: number; // 0..100 (100 = saudável)
  band: HealthBand;
  signals: HealthSignals;
}

// Limiares de faixa (RN-3503).
export const HEALTHY_MIN = 70;
export const WATCH_MIN = 40;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function bandFor(score: number): HealthBand {
  if (score >= HEALTHY_MIN) return 'healthy';
  if (score >= WATCH_MIN) return 'watch';
  return 'at_risk';
}

/** Média simples (0 se vazio). */
function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Tendência de atraso "piorando": compara a média da metade mais recente dos
 * pagamentos com a da metade mais antiga. Precisa de ao menos 3 pontos para não
 * reagir a ruído. `trendUp` quando a metade recente atrasa +2 dias a mais.
 */
function isTrendUp(paidDaysLate: number[]): boolean {
  if (paidDaysLate.length < 3) return false;
  const mid = Math.floor(paidDaysLate.length / 2);
  const older = paidDaysLate.slice(0, mid);
  const recent = paidDaysLate.slice(mid);
  return avg(recent) > avg(older) + 2;
}

/**
 * Calcula a saúde do cliente. `now` não é usado hoje (os dias já vêm calculados),
 * mas fica na assinatura para evolução (ex.: decaimento por recência).
 */
export function computeHealth(input: HealthInput, _now: Date = new Date()): HealthResult {
  const avgDaysLate = avg(input.paidDaysLate);
  const trendUp = isTrendUp(input.paidDaysLate);
  const opensNoPay = input.opens > 0 && input.paysOrAttempts === 0;

  const hasHistory =
    input.paidDaysLate.length > 0 ||
    input.openOverdueCount > 0 ||
    input.missedRecurring > 0 ||
    input.opens > 0 ||
    input.lostCases > 0;

  const signals: HealthSignals = {
    avgDaysLate: Math.round(avgDaysLate * 10) / 10,
    trendUp,
    missedRecurring: input.missedRecurring,
    openOverdue: input.openOverdueCount,
    maxDaysOverdue: input.maxDaysOverdue,
    opensNoPay,
    lostCases: input.lostCases,
    hasHistory,
  };

  // RN-3504: sem histórico → neutro (não penaliza quem acabou de entrar).
  if (!hasHistory) {
    return { score: 100, band: 'healthy', signals };
  }

  let score = 100;

  // Atraso médio: até -30 (satura em ~15 dias de atraso médio).
  score -= clamp(avgDaysLate * 2, 0, 30);
  // Tendência piorando: sinal forte de deterioração.
  if (trendUp) score -= 15;
  // Faturas em aberto vencidas: quantidade + severidade do maior atraso.
  score -= clamp(input.openOverdueCount * 8, 0, 24);
  score -= clamp(input.maxDaysOverdue, 0, 20);
  // Recorrência perdida: churn involuntário em curso.
  score -= clamp(input.missedRecurring * 12, 0, 24);
  // Hesitação (abre e não paga): comportamento de fuga.
  if (opensNoPay) score -= 15;
  // Casos de recuperação perdidos: histórico ruim de desfecho.
  score -= clamp(input.lostCases * 15, 0, 30);

  score = clamp(Math.round(score), 0, 100);
  return { score, band: bandFor(score), signals };
}
