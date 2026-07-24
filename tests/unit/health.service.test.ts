import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthService } from '../../src/services/health.service.js';
import { runWithTenant } from '../../src/context/tenant-context.js';

function makeMocks() {
  return {
    accounts: { findActiveTenantIds: vi.fn().mockResolvedValue(['t1']) },
    repo: {
      aggregateInputs: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

const svc = (m: ReturnType<typeof makeMocks>) => new HealthService(m as any);

const NOW = new Date('2026-07-23T11:10:00.000Z');

const blank = {
  paidDaysLate: [],
  openOverdueCount: 0,
  maxDaysOverdue: 0,
  missedRecurring: 0,
  opens: 0,
  paysOrAttempts: 0,
  lostCases: 0,
};

describe('HealthService (spec 0035 — Radar de Risco)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('recomputeAllForTenant calcula e faz upsert de cada cliente', async () => {
    m.repo.aggregateInputs.mockResolvedValue([
      { clientId: 'c1', input: { ...blank } }, // sem histórico → healthy 100
      { clientId: 'c2', input: { ...blank, openOverdueCount: 3, maxDaysOverdue: 30, missedRecurring: 2, opens: 4, paysOrAttempts: 0, lostCases: 1 } }, // at_risk
    ]);

    const updated = await runWithTenant('t1', () => svc(m).recomputeAllForTenant(NOW));

    expect(updated).toBe(2);
    expect(m.repo.upsert).toHaveBeenCalledTimes(2);
    const c1 = m.repo.upsert.mock.calls.find((c) => c[0] === 'c1')![2];
    const c2 = m.repo.upsert.mock.calls.find((c) => c[0] === 'c2')![2];
    expect(c1.band).toBe('healthy');
    expect(c1.score).toBe(100);
    expect(c2.band).toBe('at_risk');
  });

  it('runAllTenants soma os atualizados por tenant', async () => {
    m.repo.aggregateInputs.mockResolvedValue([{ clientId: 'c1', input: { ...blank } }]);
    const res = await svc(m).runAllTenants(NOW);
    expect(res.tenants).toBe(1);
    expect(res.updated).toBe(1);
  });

  it('recomputeForClient foca em um cliente (passa o id ao agregador)', async () => {
    m.repo.aggregateInputs.mockResolvedValue([{ clientId: 'c9', input: { ...blank } }]);
    await svc(m).recomputeForClient('c9', 't1', NOW);
    expect(m.repo.aggregateInputs).toHaveBeenCalledWith(NOW, 'c9');
    expect(m.repo.upsert).toHaveBeenCalledWith('c9', 't1', expect.objectContaining({ band: 'healthy' }));
  });
});
