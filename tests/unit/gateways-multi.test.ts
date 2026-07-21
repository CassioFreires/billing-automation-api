import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { AsaasGateway, mapAsaasStatus } from '../../src/apis/payment/asaas.gateway.js';
import { StripeGateway, mapStripeStatus } from '../../src/apis/payment/stripe.gateway.js';
import { PagBankGateway, mapPagBankStatus } from '../../src/apis/payment/pagbank.gateway.js';
import { PagarmeGateway, mapPagarmeStatus } from '../../src/apis/payment/pagarme.gateway.js';
import { EfiGateway, mapEfiStatus } from '../../src/apis/payment/efi.gateway.js';
import { resolvePaymentGatewayForTenant } from '../../src/apis/payment/index.js';

afterEach(() => vi.unstubAllGlobals());

/** fetch que devolve, em ordem, cada resposta JSON informada. */
function fetchSequence(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body, text: async () => '' });
  }
  return fn;
}

const base = { reference: 'ref-1', amount: 300, dueDate: new Date('2026-08-01T00:00:00Z') };

describe('AsaasGateway', () => {
  it('cria customer + payment e devolve o invoiceUrl (gatewayId = reference)', async () => {
    const fetchMock = fetchSequence({ id: 'cus_1' }, { id: 'pay_1', invoiceUrl: 'https://asaas/x' });
    vi.stubGlobal('fetch', fetchMock);

    const gw = new AsaasGateway({ apiKey: 'key', baseUrl: 'https://asaas' });
    const charge = await gw.createCharge(base);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://asaas/payments');
    expect(charge.gatewayId).toBe('ref-1');
    expect(charge.checkoutUrl).toBe('https://asaas/x');
  });

  it('webhook: token correto → PAID; token errado → lança', async () => {
    const gw = new AsaasGateway({ apiKey: 'k', webhookToken: 'tok' });
    const body = { event: 'PAYMENT_RECEIVED', payment: { id: 'p1', status: 'RECEIVED', externalReference: 'ref-1' } };

    const ok = await gw.verifyAndParseWebhook({ headers: { 'asaas-access-token': 'tok' }, query: {}, body });
    expect(ok).toMatchObject({ gatewayId: 'ref-1', status: 'PAID', eventId: 'p1' });

    await expect(
      gw.verifyAndParseWebhook({ headers: { 'asaas-access-token': 'errado' }, query: {}, body })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('extractReference lê payment.externalReference', () => {
    const gw = new AsaasGateway({ apiKey: 'k', webhookToken: 't' });
    expect(gw.extractReference({ headers: {}, query: {}, body: { payment: { externalReference: 'ref-9' } } })).toBe('ref-9');
  });

  it('mapeia status', () => {
    expect(mapAsaasStatus('CONFIRMED')).toBe('PAID');
    expect(mapAsaasStatus('OVERDUE')).toBe('OVERDUE');
    expect(mapAsaasStatus('REFUNDED')).toBe('FAILED');
  });
});

describe('StripeGateway', () => {
  it('cria checkout session e devolve a url', async () => {
    const fetchMock = fetchSequence({ id: 'cs_1', url: 'https://stripe/pay' });
    vi.stubGlobal('fetch', fetchMock);

    const gw = new StripeGateway({ secretKey: 'sk_test_x', baseUrl: 'https://stripe' });
    const charge = await gw.createCharge(base);

    expect(fetchMock.mock.calls[0][0]).toBe('https://stripe/v1/checkout/sessions');
    expect(charge.gatewayId).toBe('ref-1');
    expect(charge.checkoutUrl).toBe('https://stripe/pay');
  });

  it('webhook: assinatura HMAC válida → PAID; inválida → lança', async () => {
    const secret = 'whsec_test';
    const gw = new StripeGateway({ secretKey: 'sk', webhookSecret: secret });
    const body = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'ref-1', payment_status: 'paid' } },
    };
    const t = '1700000000';
    const v1 = createHmac('sha256', secret).update(`${t}.${JSON.stringify(body)}`).digest('hex');

    const ok = await gw.verifyAndParseWebhook({ headers: { 'stripe-signature': `t=${t},v1=${v1}` }, query: {}, body });
    expect(ok).toMatchObject({ gatewayId: 'ref-1', status: 'PAID', eventId: 'evt_1' });

    await expect(
      gw.verifyAndParseWebhook({ headers: { 'stripe-signature': `t=${t},v1=deadbeef` }, query: {}, body })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('mapeia status', () => {
    expect(mapStripeStatus('paid')).toBe('PAID');
    expect(mapStripeStatus('open')).toBe('PENDING');
    expect(mapStripeStatus('expired')).toBe('FAILED');
  });
});

describe('PagBankGateway', () => {
  it('cria checkout e devolve o link PAY', async () => {
    const fetchMock = fetchSequence({ id: 'ord_1', links: [{ rel: 'PAY', href: 'https://pagbank/pay' }] });
    vi.stubGlobal('fetch', fetchMock);

    const gw = new PagBankGateway({ token: 'tok', baseUrl: 'https://pagbank' });
    const charge = await gw.createCharge(base);

    expect(fetchMock.mock.calls[0][0]).toBe('https://pagbank/checkouts');
    expect(charge.gatewayId).toBe('ref-1');
    expect(charge.checkoutUrl).toBe('https://pagbank/pay');
  });

  it('webhook: x-authenticity-token válido → PAID; inválido → lança', async () => {
    const token = 'tok';
    const gw = new PagBankGateway({ token });
    const body = { id: 'n1', reference_id: 'ref-1', charges: [{ id: 'c1', status: 'PAID', reference_id: 'ref-1' }] };
    const good = createHash('sha256').update(`${JSON.stringify(body)}${token}`).digest('hex');

    const ok = await gw.verifyAndParseWebhook({ headers: { 'x-authenticity-token': good }, query: {}, body });
    expect(ok).toMatchObject({ gatewayId: 'ref-1', status: 'PAID' });

    await expect(
      gw.verifyAndParseWebhook({ headers: { 'x-authenticity-token': 'errado' }, query: {}, body })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('mapeia status', () => {
    expect(mapPagBankStatus('PAID')).toBe('PAID');
    expect(mapPagBankStatus('WAITING')).toBe('PENDING');
    expect(mapPagBankStatus('DECLINED')).toBe('FAILED');
  });
});

describe('PagarmeGateway', () => {
  it('cria order e devolve o payment_url', async () => {
    const fetchMock = fetchSequence({ id: 'or_1', code: 'ref-1', checkouts: [{ payment_url: 'https://pagarme/pay' }] });
    vi.stubGlobal('fetch', fetchMock);

    const gw = new PagarmeGateway({ secretKey: 'sk', baseUrl: 'https://pagarme' });
    const charge = await gw.createCharge(base);

    expect(fetchMock.mock.calls[0][0]).toBe('https://pagarme/orders');
    expect(charge.gatewayId).toBe('ref-1');
    expect(charge.checkoutUrl).toBe('https://pagarme/pay');
  });

  it('webhook: X-Hub-Signature válida → PAID; inválida → lança', async () => {
    const secret = 'whsec';
    const gw = new PagarmeGateway({ secretKey: 'sk', webhookSecret: secret });
    const body = { id: 'hook_1', type: 'order.paid', data: { code: 'ref-1', status: 'paid' } };
    const sig = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const ok = await gw.verifyAndParseWebhook({ headers: { 'x-hub-signature': `sha256=${sig}` }, query: {}, body });
    expect(ok).toMatchObject({ gatewayId: 'ref-1', status: 'PAID' });

    await expect(
      gw.verifyAndParseWebhook({ headers: { 'x-hub-signature': 'sha256=errado' }, query: {}, body })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('mapeia status', () => {
    expect(mapPagarmeStatus('paid')).toBe('PAID');
    expect(mapPagarmeStatus('processing')).toBe('PENDING');
    expect(mapPagarmeStatus('failed')).toBe('FAILED');
  });
});

describe('EfiGateway', () => {
  it('faz oauth, cria cobrança e gera link', async () => {
    const fetchMock = fetchSequence(
      { access_token: 'tok' },
      { data: { charge_id: 99 } },
      { data: { payment_url: 'https://efi/pay' } }
    );
    vi.stubGlobal('fetch', fetchMock);

    const gw = new EfiGateway({ clientId: 'id', clientSecret: 'sec', baseUrl: 'https://efi' });
    const charge = await gw.createCharge(base);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://efi/oauth/token');
    expect(fetchMock.mock.calls[2][0]).toBe('https://efi/v1/charge/99/link');
    expect(charge.gatewayId).toBe('ref-1');
    expect(charge.checkoutUrl).toBe('https://efi/pay');
  });

  it('webhook: token válido → PAID; inválido → lança', async () => {
    const gw = new EfiGateway({ clientId: 'i', clientSecret: 's', webhookToken: 'wt' });
    const body = { custom_id: 'ref-1', status: 'paid' };

    const ok = await gw.verifyAndParseWebhook({ headers: { 'efi-webhook-token': 'wt' }, query: {}, body });
    expect(ok).toMatchObject({ gatewayId: 'ref-1', status: 'PAID' });

    await expect(
      gw.verifyAndParseWebhook({ headers: { 'efi-webhook-token': 'errado' }, query: {}, body })
    ).rejects.toThrow('WEBHOOK_INVALID_SIGNATURE');
  });

  it('mapeia status', () => {
    expect(mapEfiStatus('paid')).toBe('PAID');
    expect(mapEfiStatus('waiting')).toBe('PENDING');
    expect(mapEfiStatus('canceled')).toBe('FAILED');
  });
});

describe('resolvePaymentGatewayForTenant (spec 0019)', () => {
  it('resolve cada provider com as credenciais do tenant', () => {
    const providers: Array<[string, string]> = [
      ['asaas', 'asaas'],
      ['pagbank', 'pagbank'],
      ['efi', 'efi'],
      ['stripe', 'stripe'],
      ['pagarme', 'pagarme'],
      ['mercadopago', 'mercadopago'],
    ];
    for (const [provider, name] of providers) {
      const gw = resolvePaymentGatewayForTenant({ provider, credentials: { apiKey: 'x', secretKey: 'y', token: 'z' } });
      expect(gw.name).toBe(name);
    }
  });

  it('provider desconhecido cai no mock', () => {
    const gw = resolvePaymentGatewayForTenant({ provider: 'inexistente' });
    expect(gw.name).toBe('mock');
  });
});
