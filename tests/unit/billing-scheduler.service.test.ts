import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock('../../src/messaging/publish/publish.messaging.js', () => ({
  publishRabbitMql: mocks.publish,
}));

const { BillingSchedulerService } = await import(
  '../../src/services/billing-scheduler.service.js'
);
const { getTenantId } = await import('../../src/context/tenant-context.js');

function make() {
  const accounts = { findActiveTenantIds: vi.fn() };
  const subscriptions = { run: vi.fn() };
  const service = new BillingSchedulerService({
    accounts: accounts as any,
    subscriptions: subscriptions as any,
  });
  return { service, accounts, subscriptions };
}

describe('BillingSchedulerService.enqueueAllTenants (fan-out)', () => {
  beforeEach(() => mocks.publish.mockReset());

  it('publica um job por tenant ativo, com o tenantId no payload', async () => {
    const { service, accounts } = make();
    accounts.findActiveTenantIds.mockResolvedValue(['t1', 't2', 't3']);

    const res = await service.enqueueAllTenants();

    expect(res).toEqual({ enfileirados: 3 });
    expect(mocks.publish).toHaveBeenCalledTimes(3);
    const msg = JSON.parse(mocks.publish.mock.calls[0][1]);
    expect(msg.tenantId).toBe('t1');
  });

  it('não publica nada quando não há tenants ativos', async () => {
    const { service, accounts } = make();
    accounts.findActiveTenantIds.mockResolvedValue([]);

    const res = await service.enqueueAllTenants();

    expect(res).toEqual({ enfileirados: 0 });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe('BillingSchedulerService.processTenant', () => {
  it('roda a geração DENTRO do contexto do tenant (isolamento)', async () => {
    const { service, subscriptions } = make();
    let seenTenant: string | undefined;
    subscriptions.run.mockImplementation(() => {
      seenTenant = getTenantId(); // deve enxergar o tenant do job
      return Promise.resolve({ processadas: 2, geradas: 2, ignoradas: 0 });
    });

    const res = await service.processTenant('tenant-xyz');

    expect(seenTenant).toBe('tenant-xyz');
    expect(res).toEqual({ processadas: 2, geradas: 2, ignoradas: 0 });
  });
});
