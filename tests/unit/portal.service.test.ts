import { describe, it, expect, vi } from 'vitest';
import { PortalService } from '../../src/services/portal.service.js';

function make() {
  const clients = { findByPortalToken: vi.fn(), ensurePortalToken: vi.fn() };
  const invoices = { findForPortal: vi.fn() };
  const service = new PortalService({ clients: clients as any, invoices: invoices as any });
  return { service, clients, invoices };
}

describe('PortalService.getByToken (spec 0027)', () => {
  it('separa abertas de histórico e monta payUrl do Elo', async () => {
    const { service, clients, invoices } = make();
    clients.findByPortalToken.mockResolvedValue({ id: 'c1', name: 'Ana', tenantId: 't1', anonymizedAt: null });
    invoices.findForPortal.mockResolvedValue([
      { id: 'a', value: 100, status: 'OVERDUE', dueDate: new Date(), paidAt: null, linkToken: 'tok-a' },
      { id: 'b', value: 50, status: 'PENDING', dueDate: new Date(), paidAt: null, linkToken: null },
      { id: 'c', value: 30, status: 'PAID', dueDate: new Date(), paidAt: new Date(), linkToken: 'tok-c' },
    ]);

    const view = await service.getByToken('portal-xyz', 'https://useadimplo.com.br/');

    expect(view?.clientName).toBe('Ana');
    expect(view?.open).toHaveLength(2);
    expect(view?.history).toHaveLength(1);
    expect(view?.totals).toEqual({ openCount: 2, openValue: 150 });
    expect(view?.open[0].payUrl).toBe('https://useadimplo.com.br/r/tok-a');
    expect(view?.open[1].payUrl).toBeNull(); // sem linkToken
  });

  it('retorna null para token inexistente', async () => {
    const { service, clients } = make();
    clients.findByPortalToken.mockResolvedValue(null);
    expect(await service.getByToken('x', 'http://x')).toBeNull();
  });

  it('não expõe portal de titular anonimizado (LGPD)', async () => {
    const { service, clients } = make();
    clients.findByPortalToken.mockResolvedValue({ id: 'c1', name: 'X', tenantId: 't1', anonymizedAt: new Date() });
    expect(await service.getByToken('x', 'http://x')).toBeNull();
  });
});

describe('PortalService.getPortalLink', () => {
  it('gera o link com o token do cliente', async () => {
    const { service, clients } = make();
    clients.ensurePortalToken.mockResolvedValue('tok-1');
    const url = await service.getPortalLink('c1', 'https://app.adimplo.com/');
    expect(url).toBe('https://app.adimplo.com/portal/tok-1');
  });

  it('null quando o cliente não existe', async () => {
    const { service, clients } = make();
    clients.ensurePortalToken.mockResolvedValue(null);
    expect(await service.getPortalLink('x', 'http://x')).toBeNull();
  });
});
