import { describe, it, expect } from 'vitest';
import {
  computeOptions,
  computeTerms,
  isReliefEligibleStatus,
  NegotiationRuleError,
  AgreementType,
  NegotiationRules,
} from '../../src/domain/negotiation.js';

const NOW = new Date('2026-07-21T00:00:00.000Z');

/** Regras "tudo ligado" para exercitar os cálculos. */
const fullRules: NegotiationRules = {
  enabled: true,
  hesitationOpens: 3,
  discountEnabled: true,
  discountPercent: 0.1, // 10%
  installmentsEnabled: true,
  maxInstallments: 3,
  deferEnabled: true,
  deferMaxDays: 7,
  deferFeePercent: 0.05, // 5%
};

describe('domain/negotiation — elegibilidade (RN-NEG1)', () => {
  it('só PENDING e OVERDUE são elegíveis', () => {
    expect(isReliefEligibleStatus('PENDING')).toBe(true);
    expect(isReliefEligibleStatus('OVERDUE')).toBe(true);
    expect(isReliefEligibleStatus('PAID')).toBe(false);
    expect(isReliefEligibleStatus('RENEGOTIATED')).toBe(false);
    expect(isReliefEligibleStatus('FAILED')).toBe(false);
  });
});

describe('domain/negotiation — computeOptions', () => {
  it('regras desligadas → nenhuma opção', () => {
    expect(computeOptions({ ...fullRules, enabled: false }, { value: 200, dueDate: NOW }, NOW)).toEqual([]);
  });

  it('todas habilitadas → 3 opções com valores corretos', () => {
    const opts = computeOptions(fullRules, { value: 200, dueDate: NOW }, NOW);
    const byType = Object.fromEntries(opts.map((o) => [o.type, o]));

    expect(byType[AgreementType.DISCOUNT].finalValue).toBe(180); // 200 - 10%
    expect(byType[AgreementType.INSTALLMENTS].installments).toBe(3);
    expect(byType[AgreementType.INSTALLMENTS].installmentValue).toBe(66.67); // 200/3
    expect(byType[AgreementType.DEFER].finalValue).toBe(210); // 200 + 5%
    // adiamento move o vencimento em +7 dias
    expect(new Date(byType[AgreementType.DEFER].newDueDate!).toISOString()).toBe(
      new Date('2026-07-28T00:00:00.000Z').toISOString()
    );
  });

  it('omite opções desabilitadas (RN-NEG2)', () => {
    const opts = computeOptions(
      { ...fullRules, installmentsEnabled: false, deferEnabled: false },
      { value: 100, dueDate: NOW },
      NOW
    );
    expect(opts.map((o) => o.type)).toEqual([AgreementType.DISCOUNT]);
  });
});

describe('domain/negotiation — computeTerms (teto do dono, RN-NEG2)', () => {
  it('desconto: finalValue = value * (1 - pct)', () => {
    const t = computeTerms(fullRules, { value: 200 }, AgreementType.DISCOUNT, undefined, NOW);
    expect(t.finalValue).toBe(180);
    expect(t.discountPercent).toBe(0.1);
    expect(t.originalValue).toBe(200);
  });

  it('adiar: finalValue com taxa e novo vencimento', () => {
    const t = computeTerms(fullRules, { value: 200 }, AgreementType.DEFER, undefined, NOW);
    expect(t.finalValue).toBe(210);
    expect(new Date(t.newDueDate).toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('parcelar dentro do teto', () => {
    const t = computeTerms(fullRules, { value: 200 }, AgreementType.INSTALLMENTS, 2, NOW);
    expect(t.installments).toBe(2);
    expect(t.installmentValue).toBe(100);
    expect(t.finalValue).toBe(200);
  });

  it('parcelas ACIMA do teto → NegotiationRuleError (→422)', () => {
    expect(() =>
      computeTerms(fullRules, { value: 200 }, AgreementType.INSTALLMENTS, 6, NOW)
    ).toThrow(NegotiationRuleError);
  });

  it('desconto quando desabilitado → NegotiationRuleError', () => {
    expect(() =>
      computeTerms({ ...fullRules, discountEnabled: false }, { value: 200 }, AgreementType.DISCOUNT, undefined, NOW)
    ).toThrow(NegotiationRuleError);
  });

  it('regras globalmente desligadas → NegotiationRuleError', () => {
    expect(() =>
      computeTerms({ ...fullRules, enabled: false }, { value: 200 }, AgreementType.DISCOUNT, undefined, NOW)
    ).toThrow(NegotiationRuleError);
  });
});
