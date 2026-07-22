import { describe, it, expect, vi } from 'vitest';
import { LgpdService } from '../../src/services/lgpd.service.js';

function makeService() {
  const clients = { findById: vi.fn(), anonymize: vi.fn() };
  const invoices = { findByClientId: vi.fn() };
  const accounts = { findCurrent: vi.fn(), exportCurrent: vi.fn(), deleteCurrent: vi.fn() };
  const service = new LgpdService({
    clients: clients as any,
    invoices: invoices as any,
    accounts: accounts as any,
  });
  return { service, clients, invoices, accounts };
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

describe('LgpdService.exportAccountData (spec 0022)', () => {
  it('exporta os dados da própria conta', async () => {
    const { service, accounts } = makeService();
    accounts.exportCurrent.mockResolvedValue({ id: 't1', name: 'Clínica X', clients: [], invoices: [] });

    const result = await service.exportAccountData();

    expect(result.account).toMatchObject({ id: 't1', name: 'Clínica X' });
    expect(typeof result.exportedAt).toBe('string');
  });
});

describe('LgpdService.deleteAccount (spec 0022)', () => {
  it('encerra a conta quando o nome confere', async () => {
    const { service, accounts } = makeService();
    accounts.findCurrent.mockResolvedValue({ id: 't1', name: 'Clínica X' });
    accounts.deleteCurrent.mockResolvedValue({ id: 't1' });

    const result = await service.deleteAccount('Clínica X');

    expect(accounts.deleteCurrent).toHaveBeenCalled();
    expect(result).toEqual({ deleted: true });
  });

  it('tolera espaços em volta na confirmação', async () => {
    const { service, accounts } = makeService();
    accounts.findCurrent.mockResolvedValue({ id: 't1', name: 'Clínica X' });
    accounts.deleteCurrent.mockResolvedValue({ id: 't1' });

    await service.deleteAccount('  Clínica X  ');
    expect(accounts.deleteCurrent).toHaveBeenCalled();
  });

  it('rejeita com NAME_MISMATCH quando o nome não confere e NÃO apaga', async () => {
    const { service, accounts } = makeService();
    accounts.findCurrent.mockResolvedValue({ id: 't1', name: 'Clínica X' });

    await expect(service.deleteAccount('outra coisa')).rejects.toThrow('NAME_MISMATCH');
    expect(accounts.deleteCurrent).not.toHaveBeenCalled();
  });
});
