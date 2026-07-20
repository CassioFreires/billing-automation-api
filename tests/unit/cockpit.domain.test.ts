import { describe, it, expect } from 'vitest';
import {
  agingBucket,
  summarizeOpenInvoices,
  inadimplenciaRate,
  dueWithinDays,
  daysOverdue,
  OpenInvoice,
} from '../../src/domain/cockpit.js';

const NOW = new Date('2026-07-20T12:00:00Z');
const d = (iso: string) => new Date(iso);

const OPEN: OpenInvoice[] = [
  { id: 'a', value: 100, dueDate: d('2026-07-25T12:00:00Z'), clientName: 'A vencer' }, // +5d
  { id: 'b', value: 200, dueDate: d('2026-07-10T12:00:00Z'), clientName: '10d atraso' }, // 10d
  { id: 'c', value: 300, dueDate: d('2026-06-01T12:00:00Z'), clientName: '49d atraso' }, // ~49d
  { id: 'e', value: 400, dueDate: d('2026-05-01T12:00:00Z'), clientName: '80d atraso' }, // ~80d
];

describe('agingBucket', () => {
  it('classifica pelos dias de atraso', () => {
    expect(agingBucket(d('2026-07-21T12:00:00Z'), NOW)).toBe('aVencer'); // amanhã
    expect(agingBucket(d('2026-07-20T12:00:00Z'), NOW)).toBe('d0a30'); // hoje (0d)
    expect(agingBucket(d('2026-06-20T12:00:00Z'), NOW)).toBe('d0a30'); // 30d
    expect(agingBucket(d('2026-06-19T12:00:00Z'), NOW)).toBe('d31a60'); // 31d
    expect(agingBucket(d('2026-05-21T12:00:00Z'), NOW)).toBe('d31a60'); // 60d
    expect(agingBucket(d('2026-05-20T12:00:00Z'), NOW)).toBe('d60mais'); // 61d
  });
});

describe('daysOverdue', () => {
  it('negativo antes do vencimento, positivo depois', () => {
    expect(daysOverdue(d('2026-07-25T12:00:00Z'), NOW)).toBe(-5);
    expect(daysOverdue(d('2026-07-10T12:00:00Z'), NOW)).toBe(10);
  });
});

describe('summarizeOpenInvoices', () => {
  it('soma aReceber, aVencer, emAtraso e os baldes de aging', () => {
    const s = summarizeOpenInvoices(OPEN, NOW);
    expect(s.aReceber).toBe(1000);
    expect(s.aVencer).toBe(100);
    expect(s.emAtraso).toBe(900);
    expect(s.aging).toEqual({ aVencer: 100, d0a30: 200, d31a60: 300, d60mais: 400 });
  });

  it('lista vazia → tudo zero', () => {
    const s = summarizeOpenInvoices([], NOW);
    expect(s.aReceber).toBe(0);
    expect(s.aging).toEqual({ aVencer: 0, d0a30: 0, d31a60: 0, d60mais: 0 });
  });
});

describe('inadimplenciaRate', () => {
  it('emAtraso / aReceber', () => {
    expect(inadimplenciaRate(900, 1000)).toBe(0.9);
  });
  it('0 quando aReceber é 0 (sem divisão por zero)', () => {
    expect(inadimplenciaRate(0, 0)).toBe(0);
  });
});

describe('dueWithinDays', () => {
  it('retorna só as que vencem na janela (a partir de hoje), ordenadas', () => {
    const r = dueWithinDays(OPEN, NOW, 7);
    expect(r.map((i) => i.id)).toEqual(['a']); // só a +5d; as vencidas ficam de fora
  });
});
