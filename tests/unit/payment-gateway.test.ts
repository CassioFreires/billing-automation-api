import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { MockPaymentGateway } from '../../src/apis/payment/mock.gateway.js';
import {
  mapMercadoPagoStatus,
  MercadoPagoGateway,
} from '../../src/apis/payment/mercadopago.gateway.js';

const originalSecret = process.env.WEBHOOK_SECRET;
afterEach(() => {
  if (originalSecret === undefined) delete process.env.WEBHOOK_SECRET;
  else process.env.WEBHOOK_SECRET = originalSecret;
});

describe('MockPaymentGateway.createCharge', () => {
  it('gera gatewayId e pix simulados', async () => {
    const gw = new MockPaymentGateway();
    const charge = await gw.createCharge({ reference: 'ref1', amount: 100, dueDate: new Date() });
    expect(charge.gatewayId).toMatch(/^pay_/);
    expect(charge.pixCopyPaste).toContain('ref1');
  });
});

describe('MockPaymentGateway.verifyAndParseWebhook', () => {
  it('normaliza o evento com o segredo correto', async () => {
    process.env.WEBHOOK_SECRET = 'sec';
    const gw = new MockPaymentGateway();
    const result = await gw.verifyAndParseWebhook({
      headers: { 'x-webhook-secret': 'sec' },
      query: {},
      body: { gatewayId: 'g1', status: 'PAID', eventId: 'evt1' },
    });
    expect(result).toMatchObject({ gatewayId: 'g1', status: 'PAID', eventId: 'evt1' });
  });

  it('lança com segredo inválido', async () => {
    process.env.WEBHOOK_SECRET = 'sec';
    const gw = new MockPaymentGateway();
    await expect(
      gw.verifyAndParseWebhook({
        headers: { 'x-webhook-secret': 'errado' },
        query: {},
        body: { gatewayId: 'g1', status: 'PAID' },
      })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('lança quando WEBHOOK_SECRET não está configurado', async () => {
    delete process.env.WEBHOOK_SECRET;
    const gw = new MockPaymentGateway();
    await expect(
      gw.verifyAndParseWebhook({ headers: {}, query: {}, body: {} })
    ).rejects.toThrow('WEBHOOK_NOT_CONFIGURED');
  });

  it('retorna null para status inválido', async () => {
    process.env.WEBHOOK_SECRET = 'sec';
    const gw = new MockPaymentGateway();
    const result = await gw.verifyAndParseWebhook({
      headers: { 'x-webhook-secret': 'sec' },
      query: {},
      body: { gatewayId: 'g1', status: 'CANCELADO' },
    });
    expect(result).toBeNull();
  });
});

describe('MercadoPagoGateway.verifyAndParseWebhook', () => {
  const MP_KEYS = ['MP_WEBHOOK_SECRET', 'MP_ACCESS_TOKEN', 'MP_BASE_URL'];
  const originalMp: Record<string, string | undefined> = {};
  for (const k of MP_KEYS) originalMp[k] = process.env[k];

  afterEach(() => {
    for (const k of MP_KEYS) {
      if (originalMp[k] === undefined) delete process.env[k];
      else process.env[k] = originalMp[k];
    }
    vi.unstubAllGlobals();
  });

  function sign(secret: string, dataId: string, requestId: string, ts: string) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    return createHmac('sha256', secret).update(manifest).digest('hex');
  }

  it('valida a assinatura, consulta o pagamento e normaliza o evento', async () => {
    process.env.MP_WEBHOOK_SECRET = 'mpsec';
    process.env.MP_ACCESS_TOKEN = 'TEST-token';

    const dataId = '123';
    const requestId = 'req-1';
    const ts = '1700000000';
    const v1 = sign('mpsec', dataId, requestId, ts);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 123,
          status: 'approved',
          external_reference: 'g1',
          date_approved: '2026-07-01T12:00:00Z',
        }),
      }))
    );

    const gw = new MercadoPagoGateway();
    const result = await gw.verifyAndParseWebhook({
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      query: { type: 'payment', 'data.id': dataId },
      body: {},
    });

    expect(result).toMatchObject({ eventId: '123', gatewayId: 'g1', status: 'PAID' });
    expect(result?.paidAt).toBeInstanceOf(Date);
  });

  it('lança com assinatura inválida (não consulta o pagamento)', async () => {
    process.env.MP_WEBHOOK_SECRET = 'mpsec';
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const gw = new MercadoPagoGateway();
    await expect(
      gw.verifyAndParseWebhook({
        headers: { 'x-signature': 'ts=1700000000,v1=deadbeef', 'x-request-id': 'req-1' },
        query: { type: 'payment', 'data.id': '123' },
        body: {},
      })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora notificações que não são de pagamento', async () => {
    const gw = new MercadoPagoGateway();
    const result = await gw.verifyAndParseWebhook({
      headers: {},
      query: { type: 'merchant_order' },
      body: {},
    });
    expect(result).toBeNull();
  });
});

describe('mapMercadoPagoStatus', () => {
  it('mapeia os status do MP para o status da fatura (RN-P5)', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('PAID');
    expect(mapMercadoPagoStatus('pending')).toBe('PENDING');
    expect(mapMercadoPagoStatus('in_process')).toBe('PENDING');
    expect(mapMercadoPagoStatus('rejected')).toBe('FAILED');
    expect(mapMercadoPagoStatus('cancelled')).toBe('FAILED');
    expect(mapMercadoPagoStatus('desconhecido')).toBe('PENDING');
  });
});
