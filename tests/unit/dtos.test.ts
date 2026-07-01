import { describe, it, expect } from 'vitest';
import { createClientSchema } from '../../src/dtos/createClient.dto.js';
import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
} from '../../src/dtos/createInvoice.dto.js';
import { loginSchema } from '../../src/dtos/login.dto.js';
import { registerSchema } from '../../src/dtos/register.dto.js';

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
