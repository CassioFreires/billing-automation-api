import { describe, it, expect } from 'vitest';
import { validateUpdatePaymentSettings } from '../../src/dtos/paymentSettings.dto.js';

describe('paymentSettings DTO (spec 0019)', () => {
  it('aceita os novos providers com credenciais', () => {
    const dto = validateUpdatePaymentSettings({
      provider: 'stripe',
      credentials: { secretKey: 'sk_test_x', webhookSecret: 'whsec_y' },
    });
    expect(dto.provider).toBe('stripe');
    expect(dto.credentials?.secretKey).toBe('sk_test_x');
  });

  it('rejeita provider desconhecido', () => {
    expect(() => validateUpdatePaymentSettings({ provider: 'boleto-caseiro' })).toThrow();
  });

  it('exige o handle quando o provider é infinitepay', () => {
    expect(() => validateUpdatePaymentSettings({ provider: 'infinitepay' })).toThrow();
    expect(validateUpdatePaymentSettings({ provider: 'infinitepay', infinitepayHandle: 'loja' }).provider).toBe(
      'infinitepay'
    );
  });

  it('permite salvar sem reenviar segredo (credentials ausente)', () => {
    const dto = validateUpdatePaymentSettings({ provider: 'asaas' });
    expect(dto.credentials).toBeUndefined();
  });
});
