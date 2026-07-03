import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InfinitePayGateway } from '../../src/apis/payment/infinitepay.gateway.js';

describe('InfinitePayGateway.createCharge', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, INFINITEPAY_HANDLE: 'minhaloja' };
    delete process.env.INFINITEPAY_REDIRECT_URL;
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('monta o link do checkout com handle, itens em centavos e order_nsu', async () => {
    const gw = new InfinitePayGateway();
    const result = await gw.createCharge({
      reference: 'ref-123',
      amount: 1.0,
      dueDate: new Date('2026-08-01'),
      description: 'Mensalidade',
    });

    expect(result.gatewayId).toBe('ref-123');
    expect(result.checkoutUrl).toBeDefined();

    const url = new URL(result.checkoutUrl!);
    expect(url.origin + url.pathname).toBe('https://checkout.infinitepay.io/minhaloja');
    expect(url.searchParams.get('order_nsu')).toBe('ref-123');

    const items = JSON.parse(url.searchParams.get('items')!);
    expect(items).toEqual([{ name: 'Mensalidade', price: 100, quantity: 1 }]); // R$1,00 = 100 centavos
  });

  it('inclui redirect_url quando configurado', async () => {
    process.env.INFINITEPAY_REDIRECT_URL = 'https://app.exemplo.com/ok';
    const gw = new InfinitePayGateway();
    const result = await gw.createCharge({
      reference: 'ref-9',
      amount: 49.9,
      dueDate: new Date('2026-08-01'),
    });

    const url = new URL(result.checkoutUrl!);
    expect(url.searchParams.get('redirect_url')).toBe('https://app.exemplo.com/ok');
    const items = JSON.parse(url.searchParams.get('items')!);
    expect(items[0].price).toBe(4990); // 49.90 → 4990 centavos
    expect(items[0].name).toBe('Cobrança'); // default quando sem description
  });

  it('lança quando INFINITEPAY_HANDLE não está configurado', async () => {
    delete process.env.INFINITEPAY_HANDLE;
    const gw = new InfinitePayGateway();
    await expect(
      gw.createCharge({ reference: 'r', amount: 10, dueDate: new Date() })
    ).rejects.toThrow('INFINITEPAY_HANDLE');
  });
});
