import { describe, it, expect } from 'vitest';
import {
  PLANS,
  resolveEntitlements,
  isOverInvoiceQuota,
  nextPeriodEnd,
} from '../../src/domain/plans.js';

const NOW = new Date('2026-07-21T12:00:00Z');
const future = new Date('2026-08-01T00:00:00Z');
const past = new Date('2026-07-01T00:00:00Z');

describe('resolveEntitlements (spec 0020)', () => {
  it('trial vigente → recursos Pro e escrita liberada', () => {
    const e = resolveEntitlements({ plan: 'pro', status: 'trialing', trialEndsAt: future, currentPeriodEnd: null }, NOW);
    expect(e.canWrite).toBe(true);
    expect(e.plan).toBe('pro');
    expect(e.features.reliefButton).toBe(true);
    expect(e.maxInvoicesPerMonth).toBeNull();
  });

  it('trial expirado → só leitura (TRIAL_EXPIRED)', () => {
    const e = resolveEntitlements({ plan: 'pro', status: 'trialing', trialEndsAt: past, currentPeriodEnd: null }, NOW);
    expect(e.canWrite).toBe(false);
    expect(e.reason).toBe('TRIAL_EXPIRED');
  });

  it('active com período vigente → recursos do plano', () => {
    const e = resolveEntitlements({ plan: 'essencial', status: 'active', trialEndsAt: null, currentPeriodEnd: future }, NOW);
    expect(e.canWrite).toBe(true);
    expect(e.plan).toBe('essencial');
    expect(e.features.reliefButton).toBe(false);
    expect(e.maxInvoicesPerMonth).toBe(200);
  });

  it('active pago com período vencido → bloqueado (PLAN_EXPIRED)', () => {
    const e = resolveEntitlements({ plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: past }, NOW);
    expect(e.canWrite).toBe(false);
    expect(e.reason).toBe('PLAN_EXPIRED');
  });

  it('free ativo → liberado dentro do limite do free', () => {
    const e = resolveEntitlements({ plan: 'free', status: 'active', trialEndsAt: null, currentPeriodEnd: null }, NOW);
    expect(e.canWrite).toBe(true);
    expect(e.plan).toBe('free');
    expect(e.maxInvoicesPerMonth).toBe(20);
  });

  it('past_due / canceled / sem registro → bloqueado', () => {
    expect(resolveEntitlements({ plan: 'pro', status: 'past_due', trialEndsAt: null, currentPeriodEnd: future }, NOW).canWrite).toBe(false);
    expect(resolveEntitlements({ plan: 'pro', status: 'canceled', trialEndsAt: null, currentPeriodEnd: future }, NOW).canWrite).toBe(false);
    expect(resolveEntitlements(null, NOW).canWrite).toBe(false);
  });

  it('conta SUSPENDED pelo admin → bloqueia escrita mesmo com plano ativo (spec 0023)', () => {
    const e = resolveEntitlements(
      { plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: future },
      NOW,
      'SUSPENDED'
    );
    expect(e.canWrite).toBe(false);
    expect(e.reason).toBe('SUSPENDED');
  });
});

describe('isOverInvoiceQuota', () => {
  const proEnt = resolveEntitlements({ plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: future }, NOW);
  const freeEnt = resolveEntitlements({ plan: 'free', status: 'active', trialEndsAt: null, currentPeriodEnd: null }, NOW);

  it('Pro (ilimitado) nunca estoura', () => {
    expect(isOverInvoiceQuota(9999, proEnt)).toBe(false);
  });

  it('Free estoura ao atingir o limite', () => {
    expect(isOverInvoiceQuota(PLANS.free.maxInvoicesPerMonth! - 1, freeEnt)).toBe(false);
    expect(isOverInvoiceQuota(PLANS.free.maxInvoicesPerMonth!, freeEnt)).toBe(true);
  });
});

describe('nextPeriodEnd', () => {
  it('avança um mês', () => {
    expect(nextPeriodEnd(new Date('2026-07-21T00:00:00Z')).toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });
});
