import { describe, it, expect } from 'vitest';
import {
  canTransitionInvoice,
  shouldRecordGatewayPayment,
  effectiveInvoiceStatus,
  InvoiceStatus,
} from '../../src/domain/status.js';

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

  it('as constantes cobrem os status do domínio (inclui RENEGOTIATED — spec 0018)', () => {
    expect(Object.values(InvoiceStatus)).toEqual([
      'PENDING',
      'PAID',
      'OVERDUE',
      'FAILED',
      'RENEGOTIATED',
    ]);
  });

  it('RENEGOTIATED é terminal e alcançável a partir de aberto (spec 0018)', () => {
    expect(canTransitionInvoice('PENDING', 'RENEGOTIATED')).toBe(true);
    expect(canTransitionInvoice('OVERDUE', 'RENEGOTIATED')).toBe(true);
    expect(canTransitionInvoice('RENEGOTIATED', 'PAID')).toBe(false);
    expect(canTransitionInvoice('PAID', 'RENEGOTIATED')).toBe(false);
  });
});

describe('shouldRecordGatewayPayment (RN-REC3, anti-duplicação)', () => {
  it('registra na transição efetiva para PAID', () => {
    expect(shouldRecordGatewayPayment('PENDING', 'PAID')).toBe(true);
    expect(shouldRecordGatewayPayment('OVERDUE', 'PAID')).toBe(true);
    expect(shouldRecordGatewayPayment(null, 'PAID')).toBe(true);
  });

  it('NÃO registra em reconfirmação (já estava PAID)', () => {
    expect(shouldRecordGatewayPayment('PAID', 'PAID')).toBe(false);
  });

  it('NÃO registra quando o novo status não é PAID', () => {
    expect(shouldRecordGatewayPayment('PENDING', 'PENDING')).toBe(false);
    expect(shouldRecordGatewayPayment('PENDING', 'FAILED')).toBe(false);
  });
});

describe('effectiveInvoiceStatus (spec 0034 — "vencida" derivada da data)', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');
  const ontem = new Date('2026-07-22T12:00:00.000Z');
  const amanha = new Date('2026-07-24T12:00:00.000Z');

  it('PENDING com vencimento no passado → OVERDUE (o coração da regra)', () => {
    expect(effectiveInvoiceStatus('PENDING', ontem, now)).toBe('OVERDUE');
  });

  it('PENDING com vencimento no futuro → continua PENDING', () => {
    expect(effectiveInvoiceStatus('PENDING', amanha, now)).toBe('PENDING');
  });

  it('vencimento exatamente agora não conta como vencida (só depois de passar)', () => {
    expect(effectiveInvoiceStatus('PENDING', now, now)).toBe('PENDING');
  });

  it('aceita dueDate como string ISO (payload da API)', () => {
    expect(effectiveInvoiceStatus('PENDING', '2026-07-22T12:00:00.000Z', now)).toBe('OVERDUE');
  });

  it('nunca mexe em status terminais/explícitos (PAID/FAILED/RENEGOTIATED)', () => {
    expect(effectiveInvoiceStatus('PAID', ontem, now)).toBe('PAID');
    expect(effectiveInvoiceStatus('FAILED', ontem, now)).toBe('FAILED');
    expect(effectiveInvoiceStatus('RENEGOTIATED', ontem, now)).toBe('RENEGOTIATED');
  });

  it('OVERDUE já persistido é preservado', () => {
    expect(effectiveInvoiceStatus('OVERDUE', ontem, now)).toBe('OVERDUE');
  });

  it('sem dueDate ou data inválida → devolve o status cru (fail-safe)', () => {
    expect(effectiveInvoiceStatus('PENDING', null, now)).toBe('PENDING');
    expect(effectiveInvoiceStatus('PENDING', 'nao-e-data', now)).toBe('PENDING');
  });
});
