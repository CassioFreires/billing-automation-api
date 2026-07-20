import { describe, it, expect } from 'vitest';
import { buildChargeMessage } from '../../src/works/invoice.worker.js';

describe('buildChargeMessage', () => {
  it('prefere o checkoutUrl quando disponível', () => {
    const msg = buildChargeMessage({
      clientName: 'Ana',
      value: 150,
      checkoutUrl: 'https://mp/checkout/abc',
      pixCopyPaste: 'pix-copia',
    });
    expect(msg).toContain('Olá Ana');
    expect(msg).toContain('R$ 150.00');
    expect(msg).toContain('Pague aqui: https://mp/checkout/abc');
    expect(msg).not.toContain('PIX:');
  });

  it('usa o PIX quando não há checkoutUrl', () => {
    const msg = buildChargeMessage({
      clientName: 'João',
      value: 99.9,
      checkoutUrl: null,
      pixCopyPaste: '000201PIX',
    });
    expect(msg).toContain('PIX: 000201PIX');
    expect(msg).not.toContain('Pague aqui');
  });

  it('omite a linha de pagamento quando não há dados', () => {
    const msg = buildChargeMessage({ clientName: 'Maria', value: 10 });
    expect(msg).toBe('Olá Maria\nValor: R$ 10.00');
  });

  it('trata value nulo como 0,00', () => {
    const msg = buildChargeMessage({ clientName: 'X', value: null });
    expect(msg).toContain('R$ 0.00');
  });

  // Elo (spec 0016): o link PRÓPRIO tem prioridade sobre o checkout do gateway.
  it('prefere o link próprio (Elo) ao checkoutUrl', () => {
    const msg = buildChargeMessage({
      clientName: 'Ana',
      value: 150,
      linkUrl: 'https://useadimplo.com.br/r/tok123',
      checkoutUrl: 'https://mp/checkout/abc',
      pixCopyPaste: 'pix-copia',
    });
    expect(msg).toContain('Pague aqui: https://useadimplo.com.br/r/tok123');
    expect(msg).not.toContain('mp/checkout');
    expect(msg).not.toContain('PIX:');
  });

  it('cai no checkoutUrl quando não há link próprio', () => {
    const msg = buildChargeMessage({
      clientName: 'Ana',
      value: 150,
      linkUrl: null,
      checkoutUrl: 'https://mp/checkout/abc',
    });
    expect(msg).toContain('Pague aqui: https://mp/checkout/abc');
  });
});
