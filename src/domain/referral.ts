/**
 * Indique e Ganhe (spec 0046, F16). Funções PURAS: aplicar o crédito de indicação
 * numa cobrança e decidir a recompensa por papel. Sem I/O — testável isoladamente.
 * Tudo em CENTAVOS (inteiro) para evitar float em dinheiro.
 */

export type RewardWho = 'both' | 'referred' | 'referrer';
export const REWARD_WHO: RewardWho[] = ['both', 'referred', 'referrer'];
export type ReferralRole = 'referrer' | 'referred';

/**
 * Aplica o crédito acumulado do cliente sobre o valor bruto da cobrança.
 * Nunca deixa negativo: usa no máximo o valor da fatura. Retorna o líquido a
 * cobrar e quanto de crédito foi efetivamente consumido.
 */
export function netAfterCredit(grossCents: number, creditCents: number): { netCents: number; usedCents: number } {
  const gross = Math.max(0, Math.round(grossCents));
  const credit = Math.max(0, Math.round(creditCents));
  const usedCents = Math.min(gross, credit);
  return { netCents: gross - usedCents, usedCents };
}

/** Recompensa (em centavos) para um papel, conforme a config `rewardWho`. */
export function rewardFor(setting: { rewardCents: number; rewardWho: string }, role: ReferralRole): number {
  const who = setting.rewardWho;
  const applies = who === 'both' || who === role;
  return applies ? Math.max(0, Math.round(setting.rewardCents)) : 0;
}

/** Normaliza o valor da recompensa (0..R$100.000) e o público. */
export function clampReward(cents: number): number {
  return Math.max(0, Math.min(100_000_00, Math.round(cents)));
}
export function normalizeWho(who: string | undefined): RewardWho {
  return REWARD_WHO.includes(who as RewardWho) ? (who as RewardWho) : 'both';
}
