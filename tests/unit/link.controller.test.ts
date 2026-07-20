import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks hoisted: o controller instancia os repositórios no import (singletons).
const h = vi.hoisted(() => ({
  findByLinkToken: vi.fn(),
  record: vi.fn(),
}));

vi.mock('../../src/repositories/invoice.repository.js', () => ({
  InvoiceRepository: class {
    findByLinkToken = h.findByLinkToken;
  },
}));
vi.mock('../../src/repositories/interaction-event.repository.js', () => ({
  InteractionEventRepository: class {
    record = h.record;
  },
}));

const { openLink } = await import('../../src/controllers/link.controller.js');

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  res.type = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

describe('openLink (rota pública /r/:token — Elo, spec 0016)', () => {
  beforeEach(() => {
    h.findByLinkToken.mockReset();
    h.record.mockReset();
  });

  it('404 quando o token não existe — e NÃO grava evento', async () => {
    h.findByLinkToken.mockResolvedValue(null);
    const res = mockRes();

    await openLink({ params: { token: 'x' }, headers: {}, ip: '1.1.1.1' } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('grava "open" (tenant da fatura, canal web) e redireciona 302 ao checkout', async () => {
    h.findByLinkToken.mockResolvedValue({
      id: 'inv1',
      tenantId: 't1',
      clientId: 'c1',
      checkoutUrl: 'https://pay/x',
      pixCopyPaste: null,
    });
    h.record.mockResolvedValue({});
    const res = mockRes();

    await openLink(
      { params: { token: 'tok' }, headers: { 'user-agent': 'UA' }, ip: '9.9.9.9' } as any,
      res
    );

    expect(h.record).toHaveBeenCalledTimes(1);
    const arg = h.record.mock.calls[0][0];
    expect(arg.type).toBe('open');
    expect(arg.tenantId).toBe('t1');
    expect(arg.invoiceId).toBe('inv1');
    expect(arg.clientId).toBe('c1');
    expect(arg.channel).toBe('web');
    // Nunca guardar IP cru — só um hash curto (RN-ELO6).
    expect(arg.metadata.ipHash).toBeTypeOf('string');
    expect(JSON.stringify(arg.metadata)).not.toContain('9.9.9.9');
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://pay/x');
  });

  it('sem checkoutUrl, responde 200 HTML com o PIX (fallback)', async () => {
    h.findByLinkToken.mockResolvedValue({
      id: 'inv1',
      tenantId: 't1',
      clientId: 'c1',
      checkoutUrl: null,
      pixCopyPaste: '000201PIX',
    });
    h.record.mockResolvedValue({});
    const res = mockRes();

    await openLink({ params: { token: 'tok' }, headers: {}, ip: undefined } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send.mock.calls[0][0]).toContain('000201PIX');
  });

  it('não bloqueia o pagamento se o registro do evento falhar', async () => {
    h.findByLinkToken.mockResolvedValue({
      id: 'inv1',
      tenantId: 't1',
      clientId: 'c1',
      checkoutUrl: 'https://pay/x',
    });
    h.record.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await openLink({ params: { token: 'tok' }, headers: {}, ip: '1.2.3.4' } as any, res);

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://pay/x');
  });
});
