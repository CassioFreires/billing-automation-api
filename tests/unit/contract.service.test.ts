import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractService, NotFoundError, BadRequestError } from '../../src/services/contract.service.js';

function makeMocks() {
  return {
    repo: {
      getSetting: vi.fn(),
      getSettingByTenant: vi.fn(),
      upsertSetting: vi.fn(),
      latestAcceptance: vi.fn(),
      recordAcceptance: vi.fn(),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new ContractService(m as any);
const setting = (over: Record<string, any> = {}) => ({ enabled: true, title: 'T', body: 'Texto do contrato', version: 2, ...over });

describe('ContractService (spec 0040 — F14)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('getSettings devolve defaults quando não configurado', async () => {
    m.repo.getSetting.mockResolvedValue(null);
    const s = await svc(m).getSettings();
    expect(s).toEqual({ enabled: false, title: 'Contrato de prestação de serviço', body: '', version: 1 });
  });

  it('getForClient → null quando contrato desabilitado ou vazio', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ enabled: false }));
    expect(await svc(m).getForClient('c1', 't1')).toBeNull();

    m.repo.getSettingByTenant.mockResolvedValue(setting({ body: '   ' }));
    expect(await svc(m).getForClient('c1', 't1')).toBeNull();
  });

  it('getForClient → accepted=true quando aceitou a versão atual', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-24') });
    const v = await svc(m).getForClient('c1', 't1');
    expect(v?.accepted).toBe(true);
    expect(v?.version).toBe(2);
  });

  it('getForClient → accepted=false quando só aceitou versão antiga', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 3 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date() });
    const v = await svc(m).getForClient('c1', 't1');
    expect(v?.accepted).toBe(false);
  });

  it('accept grava a prova na versão atual', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue(null);
    m.repo.recordAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-24') });

    const out = await svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana Beatriz', ipHash: 'abc', userAgent: 'UA' });

    expect(out.accepted).toBe(true);
    expect(out.version).toBe(2);
    expect(m.repo.recordAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c1', tenantId: 't1', version: 2, acceptedName: 'Ana Beatriz', ipHash: 'abc' })
    );
  });

  it('accept é idempotente na mesma versão (não duplica)', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ version: 2 }));
    m.repo.latestAcceptance.mockResolvedValue({ version: 2, acceptedAt: new Date('2026-07-20') });

    const out = await svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana Beatriz' });

    expect(out.accepted).toBe(true);
    expect(m.repo.recordAcceptance).not.toHaveBeenCalled();
  });

  it('accept → 404 quando não há contrato ativo', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting({ enabled: false }));
    await expect(svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Ana' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accept → 400 quando o nome é curto', async () => {
    m.repo.getSettingByTenant.mockResolvedValue(setting());
    await expect(svc(m).accept({ clientId: 'c1', tenantId: 't1', name: 'Al' })).rejects.toBeInstanceOf(BadRequestError);
  });
});
