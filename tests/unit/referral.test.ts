import { describe, it, expect } from 'vitest';
import { netAfterCredit, rewardFor, clampReward, normalizeWho } from '../../src/domain/referral.js';

describe('referral domain (spec 0046 — F16)', () => {
  it('netAfterCredit consome só o necessário e nunca fica negativo', () => {
    expect(netAfterCredit(10000, 3000)).toEqual({ netCents: 7000, usedCents: 3000 });
    expect(netAfterCredit(2000, 3000)).toEqual({ netCents: 0, usedCents: 2000 }); // crédito > fatura
    expect(netAfterCredit(5000, 0)).toEqual({ netCents: 5000, usedCents: 0 });
  });

  it('rewardFor respeita o público (both/referred/referrer)', () => {
    const s = { rewardCents: 1000, rewardWho: 'both' };
    expect(rewardFor(s, 'referrer')).toBe(1000);
    expect(rewardFor(s, 'referred')).toBe(1000);
    expect(rewardFor({ rewardCents: 1000, rewardWho: 'referred' }, 'referrer')).toBe(0);
    expect(rewardFor({ rewardCents: 1000, rewardWho: 'referrer' }, 'referred')).toBe(0);
  });

  it('clampReward limita 0..R$100.000', () => {
    expect(clampReward(-5)).toBe(0);
    expect(clampReward(100_000_00 + 1)).toBe(100_000_00);
    expect(clampReward(1500.6)).toBe(1501);
  });

  it('normalizeWho cai em both no inválido', () => {
    expect(normalizeWho('referrer')).toBe('referrer');
    expect(normalizeWho('xpto')).toBe('both');
    expect(normalizeWho(undefined)).toBe('both');
  });
});
