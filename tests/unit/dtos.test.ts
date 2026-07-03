import { describe, it, expect } from 'vitest';
import { createClientSchema } from '../../src/dtos/createClient.dto.js';
import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
} from '../../src/dtos/createInvoice.dto.js';
import { loginSchema } from '../../src/dtos/login.dto.js';
import { registerSchema } from '../../src/dtos/register.dto.js';
import { importClientsSchema } from '../../src/dtos/importClients.dto.js';
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from '../../src/dtos/subscription.dto.js';

describe('createClientSchema', () => {
  it('aceita cliente válido', () => {
    const r = createClientSchema.safeParse({
      name: 'Ana',
      phone: '11999999999',
      document: '12345678901',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita nome curto, telefone curto e documento curto', () => {
    expect(createClientSchema.safeParse({ name: 'Ab', phone: '1', document: '1' }).success).toBe(
      false
    );
  });
});

describe('createInvoiceSchema', () => {
  it('aceita e converte dueDate para Date', () => {
    const r = createInvoiceSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      value: 100,
      dueDate: '2026-07-10',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dueDate).toBeInstanceOf(Date);
  });

  it('rejeita clientId não-uuid', () => {
    const r = createInvoiceSchema.safeParse({ clientId: 'x', value: 100, dueDate: '2026-07-10' });
    expect(r.success).toBe(false);
  });

  it('rejeita valor não-positivo (RN-I1)', () => {
    const r = createInvoiceSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      value: 0,
      dueDate: '2026-07-10',
    });
    expect(r.success).toBe(false);
  });
});

describe('updateInvoiceStatusSchema', () => {
  it('aceita status do enum', () => {
    expect(updateInvoiceStatusSchema.safeParse({ gatewayId: 'gw', status: 'PAID' }).success).toBe(
      true
    );
  });

  it('rejeita status fora do enum', () => {
    expect(
      updateInvoiceStatusSchema.safeParse({ gatewayId: 'gw', status: 'CANCELADO' }).success
    ).toBe(false);
  });
});

describe('importClientsSchema', () => {
  it('aceita lote válido com status opcional', () => {
    const r = importClientsSchema.safeParse({
      clients: [
        { name: 'Ana', phone: '11999999999', document: '12345678901' },
        { name: 'Bia', phone: '11888888888', document: '98765432100', status: 'EM_ATRASO' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejeita lote vazio', () => {
    expect(importClientsSchema.safeParse({ clients: [] }).success).toBe(false);
  });

  it('rejeita linha com documento inválido', () => {
    const r = importClientsSchema.safeParse({
      clients: [{ name: 'Ana', phone: '11999999999', document: '1' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita status fora do enum', () => {
    const r = importClientsSchema.safeParse({
      clients: [{ name: 'Ana', phone: '11999999999', document: '12345678901', status: 'PENDENTE' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('createSubscriptionSchema', () => {
  it('aceita assinatura válida e aplica default dayOfMonth=10', () => {
    const r = createSubscriptionSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Plano Pro',
      amount: 99.9,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dayOfMonth).toBe(10);
  });

  it('rejeita dayOfMonth fora de 1..28', () => {
    const r = createSubscriptionSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Plano Pro',
      amount: 99.9,
      dayOfMonth: 31,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita amount não-positivo', () => {
    const r = createSubscriptionSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Plano Pro',
      amount: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe('updateSubscriptionSchema', () => {
  it('aceita transição de status do enum', () => {
    expect(updateSubscriptionSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
  });

  it('rejeita status fora do enum', () => {
    expect(updateSubscriptionSchema.safeParse({ status: 'ARQUIVADA' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('aceita credenciais preenchidas', () => {
    expect(loginSchema.safeParse({ username: 'admin', password: 's3nha' }).success).toBe(true);
  });

  it('rejeita campos vazios', () => {
    expect(loginSchema.safeParse({ username: '', password: '' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('aceita cadastro válido', () => {
    const r = registerSchema.safeParse({
      accountName: 'Acme',
      name: 'Ana',
      email: 'ana@acme.com',
      password: 'segredo123',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita e-mail inválido', () => {
    const r = registerSchema.safeParse({
      accountName: 'Acme',
      name: 'Ana',
      email: 'nao-email',
      password: 'segredo123',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita senha curta (< 8) (RN-U2)', () => {
    const r = registerSchema.safeParse({
      accountName: 'Acme',
      name: 'Ana',
      email: 'ana@acme.com',
      password: '123',
    });
    expect(r.success).toBe(false);
  });
});
