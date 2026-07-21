import { describe, it, expect, vi } from 'vitest';
import { AdminService } from '../../src/services/admin.service.js';

function make() {
  const repo = {
    allSubscriptions: vi.fn(),
    listTenants: vi.fn(),
    getTenant: vi.fn(),
    setAccountStatus: vi.fn().mockResolvedValue({}),
    overrideSubscription: vi.fn().mockResolvedValue({}),
    createAudit: vi.fn().mockResolvedValue({}),
  };
  const auth = { issueImpersonation: vi.fn().mockResolvedValue({ token: 'tok', expiresIn: '30m' }) };
  const service = new AdminService({ repo: repo as any, auth: auth as any });
  return { service, repo, auth };
}

const future = new Date(Date.now() + 30 * 86400000);
const NOW = new Date();

describe('AdminService.getMetrics', () => {
  it('MRR soma apenas planos pagos ativos e vigentes', async () => {
    const { service, repo } = make();
    repo.allSubscriptions.mockResolvedValue([
      { plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: future }, // 19900
      { plan: 'essencial', status: 'active', trialEndsAt: null, currentPeriodEnd: future }, // 4900
      { plan: 'pro', status: 'active', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 1000) }, // vencido → não conta
      { plan: 'free', status: 'active', trialEndsAt: null, currentPeriodEnd: null }, // free → não conta
      { plan: 'pro', status: 'trialing', trialEndsAt: future, currentPeriodEnd: null }, // trial → não conta MRR
    ]);
    const m = await service.getMetrics(NOW);
    expect(m.mrrCents).toBe(19900 + 4900);
    expect(m.totalTenants).toBe(5);
    expect(m.byStatus.active).toBe(4);
    expect(m.byStatus.trialing).toBe(1);
  });
});

describe('AdminService actions (auditoria)', () => {
  it('suspend seta SUSPENDED e grava auditoria', async () => {
    const { service, repo } = make();
    await service.suspend('admin@x.com', 't1');
    expect(repo.setAccountStatus).toHaveBeenCalledWith('t1', 'SUSPENDED');
    expect(repo.createAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'suspend', targetTenantId: 't1', adminEmail: 'admin@x.com' }));
  });

  it('activate seta ACTIVE e grava auditoria', async () => {
    const { service, repo } = make();
    await service.activate('admin@x.com', 't1');
    expect(repo.setAccountStatus).toHaveBeenCalledWith('t1', 'ACTIVE');
    expect(repo.createAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'activate' }));
  });

  it('changePlan pago → ativa com período; grava auditoria', async () => {
    const { service, repo } = make();
    await service.changePlan('admin@x.com', 't1', 'pro', NOW);
    expect(repo.overrideSubscription).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ plan: 'pro', status: 'active', currentPeriodEnd: expect.any(Date) })
    );
    expect(repo.createAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'change_plan', meta: { plan: 'pro' } }));
  });

  it('changePlan free → sem período', async () => {
    const { service, repo } = make();
    await service.changePlan('admin@x.com', 't1', 'free', NOW);
    expect(repo.overrideSubscription).toHaveBeenCalledWith('t1', expect.objectContaining({ plan: 'free', currentPeriodEnd: null }));
  });

  it('plano inválido → erro', async () => {
    const { service } = make();
    await expect(service.changePlan('admin@x.com', 't1', 'ouro' as any, NOW)).rejects.toThrow();
  });

  it('impersonate emite token e grava auditoria', async () => {
    const { service, repo, auth } = make();
    const res = await service.impersonate('admin@x.com', 't1');
    expect(res.token).toBe('tok');
    expect(auth.issueImpersonation).toHaveBeenCalledWith('admin@x.com', 't1');
    expect(repo.createAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'impersonate' }));
  });
});
