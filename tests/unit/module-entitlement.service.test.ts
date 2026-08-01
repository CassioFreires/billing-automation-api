import { describe, it, expect, vi } from 'vitest';
import { ModuleEntitlementService, ModuleError } from '../../src/services/module-entitlement.service.js';

function makeService(plan: string, grants: Array<{ moduleKey: string; granted: boolean }>) {
  const repo = {
    listByTenant: vi.fn().mockResolvedValue(grants),
    listByTenantId: vi.fn().mockResolvedValue(grants),
    upsert: vi.fn().mockImplementation(async (_t: string, moduleKey: string, granted: boolean) => ({ moduleKey, granted })),
  };
  const platform = {
    entitlementsForCurrentTenant: vi.fn().mockResolvedValue({ plan }),
    entitlementsForTenant: vi.fn().mockResolvedValue({ plan }),
  };
  const service = new ModuleEntitlementService({ repo: repo as any, platform: platform as any });
  return { service, repo, platform };
}

describe('ModuleEntitlementService (spec 0051)', () => {
  it('compõe plano + grants em effectiveModules', async () => {
    const { service } = makeService('free', [{ moduleKey: 'fiscal', granted: true }]);
    await expect(service.effectiveModules()).resolves.toEqual(['fiscal']);
  });

  it('has() reflete o módulo efetivo', async () => {
    const { service } = makeService('pro', []);
    await expect(service.has('growth')).resolves.toBe(true);
    const free = makeService('free', []);
    await expect(free.service.has('growth')).resolves.toBe(false);
  });

  it('describeForTenant devolve plano + 4 add-ons com origem', async () => {
    const { service } = makeService('free', [{ moduleKey: 'recovery', granted: true }]);
    const out = await service.describeForTenant('t1');
    expect(out.plan).toBe('free');
    expect(out.modules).toHaveLength(4);
    expect(out.modules.find((m) => m.key === 'recovery')).toMatchObject({ granted: true, source: 'grant' });
  });

  it('setGrant valida a chave e faz upsert', async () => {
    const { service, repo } = makeService('free', []);
    await expect(service.setGrant('t1', 'fiscal', true)).resolves.toEqual({ key: 'fiscal', granted: true });
    expect(repo.upsert).toHaveBeenCalledWith('t1', 'fiscal', true);
    await expect(service.setGrant('t1', 'bogus', true)).rejects.toBeInstanceOf(ModuleError);
  });
});
