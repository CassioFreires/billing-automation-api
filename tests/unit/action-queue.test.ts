import { describe, it, expect } from 'vitest';
import { rankDailyActions, type ActionCandidate } from '../../src/domain/action-queue.js';

const NOW = new Date('2026-07-23T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const cand = (over: Partial<ActionCandidate> = {}): ActionCandidate => ({
  invoiceId: 'inv',
  clientName: 'Cliente',
  value: 100,
  dueDate: daysAgo(5),
  band: null,
  hasCase: false,
  ...over,
});

describe('rankDailyActions (spec 0036 — Lista do Dia)', () => {
  it('ordena por dinheiro em risco (priority) desc', () => {
    const r = rankDailyActions(
      [
        cand({ invoiceId: 'a', value: 100 }),
        cand({ invoiceId: 'b', value: 500 }),
        cand({ invoiceId: 'c', value: 250 }),
      ],
      NOW
    );
    expect(r.itens.map((i) => i.invoiceId)).toEqual(['b', 'c', 'a']);
  });

  it('faixa at_risk sobe na fila vs healthy de mesmo valor/atraso (RN-3602)', () => {
    const r = rankDailyActions(
      [
        cand({ invoiceId: 'risco', band: 'at_risk' }),
        cand({ invoiceId: 'ok', band: 'healthy' }),
      ],
      NOW
    );
    expect(r.itens[0].invoiceId).toBe('risco');
    expect(r.itens[0].priority).toBeGreaterThan(r.itens[1].priority);
  });

  it('vencida há mais tempo pesa mais que recém-vencida (severidade)', () => {
    const r = rankDailyActions(
      [
        cand({ invoiceId: 'velha', dueDate: daysAgo(50) }),
        cand({ invoiceId: 'nova', dueDate: daysAgo(1) }),
      ],
      NOW
    );
    expect(r.itens[0].invoiceId).toBe('velha');
  });

  it('classifica recuperar (com caso) vs cobrar (sem caso)', () => {
    const r = rankDailyActions(
      [cand({ invoiceId: 'x', hasCase: true }), cand({ invoiceId: 'y', hasCase: false })],
      NOW
    );
    const x = r.itens.find((i) => i.invoiceId === 'x')!;
    const y = r.itens.find((i) => i.invoiceId === 'y')!;
    expect(x.kind).toBe('recuperar');
    expect(y.kind).toBe('cobrar');
  });

  it('a_vencer (próx. 7 dias) entra com peso menor que uma vencida de mesmo valor', () => {
    const r = rankDailyActions(
      [
        cand({ invoiceId: 'vencida', dueDate: daysAgo(2) }),
        cand({ invoiceId: 'avencer', dueDate: daysAhead(3) }),
      ],
      NOW
    );
    const avencer = r.itens.find((i) => i.invoiceId === 'avencer')!;
    expect(avencer.kind).toBe('a_vencer');
    expect(r.itens[0].invoiceId).toBe('vencida');
  });

  it('vencimento além de 7 dias NÃO entra (não é ação de hoje — RN-3603)', () => {
    const r = rankDailyActions([cand({ dueDate: daysAhead(20) })], NOW);
    expect(r.total).toBe(0);
    expect(r.itens).toHaveLength(0);
  });

  it('corta no limite e reporta total vs mostrando (RN-3604)', () => {
    const many = Array.from({ length: 20 }, (_, i) => cand({ invoiceId: `i${i}`, value: 100 + i }));
    const r = rankDailyActions(many, NOW, 12);
    expect(r.total).toBe(20);
    expect(r.mostrando).toBe(12);
    expect(r.itens).toHaveLength(12);
    // o de maior valor vem primeiro
    expect(r.itens[0].invoiceId).toBe('i19');
  });

  it('motivo descreve o atraso e a faixa', () => {
    const r = rankDailyActions([cand({ dueDate: daysAgo(10), band: 'at_risk', hasCase: true })], NOW);
    expect(r.itens[0].motivo).toContain('Vencida há 10 dias');
    expect(r.itens[0].motivo).toContain('Em risco');
    expect(r.itens[0].motivo).toContain('recuperação');
  });
});
