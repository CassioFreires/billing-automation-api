import { describe, it, expect } from 'vitest';
import { canTransitionInvoice, InvoiceStatus } from '../../src/domain/status.js';

describe('canTransitionInvoice (máquina de estados da fatura)', () => {
  it('PAID é terminal: não regride para nenhum outro status', () => {
    expect(canTransitionInvoice('PAID', 'PENDING')).toBe(false);
    expect(canTransitionInvoice('PAID', 'OVERDUE')).toBe(false);
    expect(canTransitionInvoice('PAID', 'FAILED')).toBe(false);
  });

  it('permite as transições válidas a partir de PENDING', () => {
    expect(canTransitionInvoice('PENDING', 'PAID')).toBe(true);
    expect(canTransitionInvoice('PENDING', 'OVERDUE')).toBe(true);
    expect(canTransitionInvoice('PENDING', 'FAILED')).toBe(true);
  });

  it('mesmo status é no-op permitido (idempotência)', () => {
    expect(canTransitionInvoice('PAID', 'PAID')).toBe(true);
    expect(canTransitionInvoice('PENDING', 'PENDING')).toBe(true);
  });

  it('OVERDUE pode ir para PAID/FAILED, não volta para PENDING', () => {
    expect(canTransitionInvoice('OVERDUE', 'PAID')).toBe(true);
    expect(canTransitionInvoice('OVERDUE', 'FAILED')).toBe(true);
    expect(canTransitionInvoice('OVERDUE', 'PENDING')).toBe(false);
  });

  it('status de origem desconhecido → nega (fail-closed)', () => {
    expect(canTransitionInvoice('BANANA', 'PAID')).toBe(false);
  });

  it('as constantes cobrem os 4 status', () => {
    expect(Object.values(InvoiceStatus)).toEqual(['PENDING', 'PAID', 'OVERDUE', 'FAILED']);
  });
});
