import { describe, it, expect } from 'vitest';
import { computeHealth, type HealthInput } from '../../src/domain/health-score.js';

const BASE: HealthInput = {
  paidDaysLate: [],
  openOverdueCount: 0,
  maxDaysOverdue: 0,
  missedRecurring: 0,
  opens: 0,
  paysOrAttempts: 0,
  lostCases: 0,
};

const input = (over: Partial<HealthInput> = {}): HealthInput => ({ ...BASE, ...over });

describe('computeHealth (spec 0035 — Radar de Risco)', () => {
  it('cliente sem histórico → neutro (healthy, 100) — não penaliza (RN-3504)', () => {
    const r = computeHealth(input());
    expect(r.score).toBe(100);
    expect(r.band).toBe('healthy');
    expect(r.signals.hasHistory).toBe(false);
  });

  it('bom pagador (sempre em dia) → healthy', () => {
    const r = computeHealth(input({ paidDaysLate: [0, 0, 1, 0], paysOrAttempts: 4, opens: 4 }));
    expect(r.band).toBe('healthy');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('atraso crescente + parou de abrir/pagar → at_risk (cenário da Maria)', () => {
    const r = computeHealth(
      input({
        paidDaysLate: [2, 5, 9], // piorando
        openOverdueCount: 1,
        maxDaysOverdue: 12,
        opens: 3,
        paysOrAttempts: 0, // abriu e não pagou → hesitação
      })
    );
    expect(r.band).toBe('at_risk');
    expect(r.signals.trendUp).toBe(true);
    expect(r.signals.opensNoPay).toBe(true);
  });

  it('paga ~1 semana atrasado E tem uma vencida em aberto → watch (atenção)', () => {
    const r = computeHealth(
      input({ paidDaysLate: [6, 7, 8], openOverdueCount: 1, maxDaysOverdue: 10, paysOrAttempts: 3, opens: 3 })
    );
    expect(r.band).toBe('watch');
  });

  it('recorrência perdida + caso de recuperação perdido derruba o score', () => {
    const r = computeHealth(input({ missedRecurring: 2, lostCases: 1, openOverdueCount: 2, maxDaysOverdue: 20 }));
    expect(r.band).toBe('at_risk');
  });

  it('score nunca sai de 0..100 (satura)', () => {
    const r = computeHealth(
      input({
        paidDaysLate: [30, 40, 50],
        openOverdueCount: 10,
        maxDaysOverdue: 90,
        missedRecurring: 5,
        opens: 10,
        paysOrAttempts: 0,
        lostCases: 5,
      })
    );
    expect(r.score).toBe(0);
    expect(r.band).toBe('at_risk');
  });

  it('tendência precisa de >=3 pontos (não reage a ruído de 2 pagamentos)', () => {
    const r = computeHealth(input({ paidDaysLate: [0, 10] }));
    expect(r.signals.trendUp).toBe(false);
  });

  it('opensNoPay só quando abriu E não houve nenhuma tentativa/pagamento', () => {
    expect(computeHealth(input({ opens: 2, paysOrAttempts: 1 })).signals.opensNoPay).toBe(false);
    expect(computeHealth(input({ opens: 0, paysOrAttempts: 0 })).signals.opensNoPay).toBe(false);
    expect(computeHealth(input({ opens: 2, paysOrAttempts: 0 })).signals.opensNoPay).toBe(true);
  });
});
