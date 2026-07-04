import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { serializeDecimal } from '../../src/middlewares/serialize-decimal.middleware.js';

/** res falso que captura o que foi passado ao json() DEPOIS do middleware. */
function makeRes() {
  const res: any = {
    captured: undefined,
    json(payload: unknown) {
      // este é o json ORIGINAL; o middleware o substitui por um wrapper
      this.captured = payload;
      return this;
    },
  };
  return res;
}

function applyAndSend(payload: unknown) {
  const res = makeRes();
  serializeDecimal({} as any, res as any, () => {});
  res.json(payload); // agora passa pelo wrapper do middleware
  return res.captured;
}

describe('serializeDecimal middleware', () => {
  it('converte Prisma.Decimal no topo para number', () => {
    const out: any = applyAndSend({ value: new Prisma.Decimal('100.50') });
    expect(out.value).toBe(100.5);
    expect(typeof out.value).toBe('number');
  });

  it('converte Decimal aninhado, em arrays e mantém outros tipos', () => {
    const date = new Date('2026-07-04T00:00:00.000Z');
    const out: any = applyAndSend({
      value: new Prisma.Decimal('9.99'),
      items: [
        { unitPrice: new Prisma.Decimal('1.10'), quantity: 2 },
        { unitPrice: new Prisma.Decimal('3.30'), quantity: 1 },
      ],
      client: { name: 'Ana', debtValue: new Prisma.Decimal('0.00') },
      dueDate: date,
      status: 'PENDING',
      nada: null,
    });

    expect(out.value).toBe(9.99);
    expect(out.items[0].unitPrice).toBe(1.1);
    expect(out.items[0].quantity).toBe(2);
    expect(out.items[1].unitPrice).toBe(3.3);
    expect(out.client.debtValue).toBe(0);
    expect(typeof out.client.debtValue).toBe('number');
    expect(out.dueDate).toBeInstanceOf(Date); // Date preservada
    expect(out.status).toBe('PENDING');
    expect(out.nada).toBeNull();
  });

  it('lida com null/primitivos direto', () => {
    expect(applyAndSend(null)).toBeNull();
    expect(applyAndSend(42)).toBe(42);
    expect(applyAndSend('texto')).toBe('texto');
  });
});
