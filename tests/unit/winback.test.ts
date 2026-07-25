import { describe, it, expect } from 'vitest';
import {
  isDueForWinback, winbackChargeValue, buildWinbackMessage,
  clampWinbackDiscount, clampWinbackDays,
} from '../../src/domain/winback.js';

describe('winback domain (spec 0045 — F5)', () => {
  it('clampWinbackDiscount limita 0..90', () => {
    expect(clampWinbackDiscount(-5)).toBe(0);
    expect(clampWinbackDiscount(200)).toBe(90);
    expect(clampWinbackDiscount(10.6)).toBe(11);
  });

  it('clampWinbackDays limita 0..180', () => {
    expect(clampWinbackDays(-1)).toBe(0);
    expect(clampWinbackDays(999)).toBe(180);
  });

  it('isDueForWinback: só dispara depois da janela', () => {
    const eligible = new Date('2026-07-01T00:00:00Z');
    expect(isDueForWinback(eligible, 15, new Date('2026-07-10T00:00:00Z'))).toBe(false); // 9 dias
    expect(isDueForWinback(eligible, 15, new Date('2026-07-16T00:00:00Z'))).toBe(true); // 15 dias
    expect(isDueForWinback(eligible, 15, new Date('2026-07-20T00:00:00Z'))).toBe(true); // 19 dias
  });

  it('isDueForWinback com daysAfter=0 dispara na hora', () => {
    const t = new Date('2026-07-01T00:00:00Z');
    expect(isDueForWinback(t, 0, t)).toBe(true);
  });

  it('winbackChargeValue aplica o desconto e arredonda 2 casas', () => {
    expect(winbackChargeValue(100, 10)).toBe(90);
    expect(winbackChargeValue(89.9, 30)).toBe(62.93);
    expect(winbackChargeValue(100, 0)).toBe(100);
  });

  it('winbackChargeValue nunca fica negativo (desconto travado em 90)', () => {
    expect(winbackChargeValue(100, 200)).toBe(10); // 90% de desconto
  });

  it('buildWinbackMessage usa o padrão quando não há template', () => {
    const msg = buildWinbackMessage('Ana', 90, 10);
    expect(msg).toContain('Ana');
    expect(msg).toContain('R$ 90.00');
    expect(msg).toContain('10%');
  });

  it('buildWinbackMessage aplica placeholders do template do dono', () => {
    const msg = buildWinbackMessage('João', 62.93, 30, 'Ei {nome}, volte por {valor} ({desconto} off)!');
    expect(msg).toBe('Ei João, volte por R$ 62.93 (30% off)!');
  });
});
