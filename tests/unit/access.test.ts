import { describe, it, expect } from 'vitest';
import { decideAccess, type AccessInput } from '../../src/domain/access.js';

const base = (over: Partial<AccessInput> = {}): AccessInput => ({
  enabled: true,
  hasOverdue: true,
  maxDaysOverdue: 10,
  graceDays: 3,
  requireSignedContract: true,
  contractAccepted: true,
  override: 'none',
  ...over,
});

describe('decideAccess (spec 0042 — F12, travas de segurança)', () => {
  it('em dia NUNCA é bloqueado (RN-4202)', () => {
    const d = decideAccess(base({ hasOverdue: false }));
    expect(d.state).toBe('allowed');
    expect(d.granted).toBe(true);
  });

  it('controle desligado → sempre liberado (RN-4203)', () => {
    expect(decideAccess(base({ enabled: false, maxDaysOverdue: 99 })).state).toBe('allowed');
  });

  it('exige contrato + não assinou → NÃO bloqueia (RN-4204)', () => {
    const d = decideAccess(base({ contractAccepted: false, maxDaysOverdue: 99 }));
    expect(d.state).toBe('allowed');
    expect(d.reason).toContain('contrato');
  });

  it('não exige contrato → bloqueia mesmo sem aceite', () => {
    expect(decideAccess(base({ requireSignedContract: false, contractAccepted: false, maxDaysOverdue: 99 })).state).toBe('blocked');
  });

  it('atraso dentro da carência → grace (ainda liberado)', () => {
    const d = decideAccess(base({ maxDaysOverdue: 2, graceDays: 3 }));
    expect(d.state).toBe('grace');
    expect(d.granted).toBe(true);
  });

  it('atraso acima da carência → blocked (nega acesso)', () => {
    const d = decideAccess(base({ maxDaysOverdue: 10, graceDays: 3 }));
    expect(d.state).toBe('blocked');
    expect(d.granted).toBe(false);
  });

  it('limite exato da carência ainda é grace', () => {
    expect(decideAccess(base({ maxDaysOverdue: 3, graceDays: 3 })).state).toBe('grace');
  });

  it('override allow vence tudo (mesmo devendo muito)', () => {
    expect(decideAccess(base({ override: 'allow', maxDaysOverdue: 99 })).state).toBe('allowed');
  });

  it('override block vence tudo (mesmo em dia)', () => {
    const d = decideAccess(base({ override: 'block', hasOverdue: false }));
    expect(d.state).toBe('blocked');
    expect(d.granted).toBe(false);
  });
});
