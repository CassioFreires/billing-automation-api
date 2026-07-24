import { describe, it, expect } from 'vitest';
import { projectCashflow, payProbability, type CashflowItem } from '../../src/domain/cashflow.js';

const NOW = new Date('2026-07-24T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const item = (over: Partial<CashflowItem> = {}): CashflowItem => ({
  amount: 100,
  dueDate: inDays(3),
  band: 'healthy',
  avgDaysLate: 0,
  ...over,
});

describe('payProbability (spec 0039)', () => {
  it('cai com a faixa de risco', () => {
    expect(payProbability('healthy', 0)).toBe(0.95);
    expect(payProbability('watch', 0)).toBe(0.75);
    expect(payProbability('at_risk', 0)).toBe(0.45);
    expect(payProbability(null, 0)).toBe(0.8); // sem score = neutro
  });

  it('cai com o atraso médio (satura em ~60d)', () => {
    expect(payProbability('healthy', 60)).toBe(0.38); // 0.95 * 0.4
    expect(payProbability('healthy', 30)).toBeCloseTo(0.48, 2); // 0.95 * 0.5
  });
});

describe('projectCashflow (spec 0039 — Previsão de Caixa)', () => {
  it('30 dias → ~5 baldes semanais', () => {
    const f = projectCashflow([], NOW, 30);
    expect(f.baldes.length).toBe(5);
    expect(f.total).toEqual({ esperado: 0, provavel: 0, confianca: 0 });
  });

  it('distribui por semana e soma esperado/provável', () => {
    const f = projectCashflow(
      [item({ amount: 200, dueDate: inDays(2) }), item({ amount: 100, dueDate: inDays(10) })],
      NOW,
      30
    );
    expect(f.baldes[0].esperado).toBe(200); // semana 1
    expect(f.baldes[1].esperado).toBe(100); // semana 2 (dia 10)
    expect(f.total.esperado).toBe(300);
  });

  it('provável = esperado × probabilidade (at_risk reduz)', () => {
    const f = projectCashflow([item({ amount: 100, band: 'at_risk', avgDaysLate: 0 })], NOW, 30);
    expect(f.total.esperado).toBe(100);
    expect(f.total.provavel).toBe(45); // 100 * 0.45
    expect(f.total.confianca).toBe(0.45);
  });

  it('vencidas entram no 1º balde (RN-3903)', () => {
    const f = projectCashflow([item({ amount: 100, dueDate: inDays(-5) })], NOW, 30);
    expect(f.baldes[0].esperado).toBe(100);
  });

  it('ignora vencimentos além da janela', () => {
    const f = projectCashflow([item({ amount: 100, dueDate: inDays(45) })], NOW, 30);
    expect(f.total.esperado).toBe(0);
  });

  it('confiança = provável ÷ esperado', () => {
    const f = projectCashflow(
      [item({ amount: 100, band: 'healthy' }), item({ amount: 100, band: 'at_risk' })],
      NOW,
      30
    );
    // (95 + 45) / 200 = 0.7
    expect(f.total.confianca).toBe(0.7);
  });
});
