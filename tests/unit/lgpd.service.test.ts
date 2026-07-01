import { describe, it, expect, vi } from 'vitest';
import { LgpdService } from '../../src/services/lgpd.service.js';

function makeService() {
  const clients = { findById: vi.fn(), anonymize: vi.fn() };
  const invoices = { findByClientId: vi.fn() };
  const service = new LgpdService({ clients: clients as any, invoices: invoices as any });
  return { service, clients, invoices };
}

describe('LgpdService.exportClientData', () => {
  it('exporta o titular e suas faturas (RN-L1)', async () => {
    const { service, clients, invoices } = makeService();
    clients.findById.mockResolvedValue({ id: 'c1', name: 'Ana' });
    invoices.findByClientId.mockResolvedValue([{ id: 'inv1' }]);

    const result = await service.exportClientData('c1');

    expect(result.client).toEqual({ id: 'c1', name: 'Ana' });
    expect(result.invoices).toEqual([{ id: 'inv1' }]);
    expect(typeof result.exportedAt).toBe('string');
    expect(invoices.findByClientId).toHaveBeenCalledWith('c1');
  });

  it('lança CLIENT_NOT_FOUND quando o titular não existe no tenant', async () => {
    const { service, clients, invoices } = makeService();
    clients.findById.mockResolvedValue(null);

    await expect(service.exportClientData('x')).rejects.toThrow('CLIENT_NOT_FOUND');
    expect(invoices.findByClientId).not.toHaveBeenCalled();
  });
});

describe('LgpdService.anonymizeClient', () => {
  it('anonimiza quando o titular ainda não foi anonimizado (RN-L2)', async () => {
    const { service, clients } = makeService();
    clients.findById.mockResolvedValue({ id: 'c1', anonymizedAt: null });
    clients.anonymize.mockResolvedValue({ id: 'c1', name: 'Titular anonimizado (LGPD)' });

    const result = await service.anonymizeClient('c1');

    expect(clients.anonymize).toHaveBeenCalledWith('c1');
    expect(result).toMatchObject({ name: 'Titular anonimizado (LGPD)' });
  });

  it('é idempotente: não reanonimiza (RN-L4)', async () => {
    const { service, clients } = makeService();
    clients.findById.mockResolvedValue({ id: 'c1', anonymizedAt: new Date() });

    await service.anonymizeClient('c1');

    expect(clients.anonymize).not.toHaveBeenCalled();
  });

  it('lança CLIENT_NOT_FOUND quando o titular não existe', async () => {
    const { service, clients } = makeService();
    clients.findById.mockResolvedValue(null);

    await expect(service.anonymizeClient('x')).rejects.toThrow('CLIENT_NOT_FOUND');
    expect(clients.anonymize).not.toHaveBeenCalled();
  });
});
