import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecoveryService } from '../../src/services/recovery.service.js';

// Mocks dos colaboradores. O RecoveryService usa o runWITHTenant REAL, então
// requireTenantId() dentro do sweep resolve o tenant do fan-out.
function makeMocks() {
  return {
    accounts: { findActiveTenantIds: vi.fn().mockResolvedValue(['t1']) },
    recovery: {
      findOverdueWithoutCase: vi.fn().mockResolvedValue([]),
      openCase: vi.fn().mockResolvedValue({}),
      findDueCases: vi.fn().mockResolvedValue([]),
      recordAttemptAndAdvance: vi.fn().mockResolvedValue(undefined),
      markLost: vi.fn().mockResolvedValue({}),
      closeByInvoiceId: vi.fn().mockResolvedValue({ closed: true }),
      listForTenant: vi.fn().mockResolvedValue([]),
      findByIdForTenant: vi.fn().mockResolvedValue(null),
      cancelById: vi.fn().mockResolvedValue({ cancelled: true }),
    },
    invoices: { markOverdueByIds: vi.fn().mockResolvedValue(0) },
    events: { countsByInvoice: vi.fn().mockResolvedValue({}) },
    notifications: { queueOverdueInvoices: vi.fn().mockResolvedValue({ enqueued: 1 }) },
    channels: { get: vi.fn().mockResolvedValue({ channel: 'whatsapp' }) },
    negotiation: { getRules: vi.fn().mockResolvedValue({ enabled: false, hesitationOpens: 3 }) },
  };
}

function makeService(m: ReturnType<typeof makeMocks>) {
  return new RecoveryService(m as any);
}

const NOW = new Date('2026-08-05T11:05:00.000Z');

function dueCase(overrides: Record<string, any> = {}) {
  return {
    id: 'case1',
    currentStep: 0,
    lastChannel: null,
    reliefOffered: false,
    invoice: {
      id: 'inv1',
      status: 'OVERDUE',
      value: 100,
      clientName: 'Joao',
      phone: '11999998888',
      document: '12345678900',
      hasEmail: false,
    },
    ...overrides,
  };
}

describe('RecoveryService (spec 0033 — F1)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => {
    m = makeMocks();
  });

  it('abre um caso para fatura vencida sem caso (RN-3301)', async () => {
    m.recovery.findOverdueWithoutCase.mockResolvedValue([
      { id: 'inv1', value: 100, dueDate: NOW, subscriptionId: null, clientId: 'c1',
        clientName: 'Joao', phone: '11999998888', document: '123', hasEmail: false },
    ]);

    const res = await makeService(m).runAllTenants(NOW);

    expect(res.opened).toBe(1);
    expect(m.recovery.openCase).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv1', tenantId: 't1', amountAtRisk: 100, nextActionAt: NOW })
    );
    // RN-3310: marca a fatura vencida como OVERDUE ao abrir o caso.
    expect(m.invoices.markOverdueByIds).toHaveBeenCalledWith(['inv1']);
  });

  it('avança um caso sem hesitação → remind (enfileira e registra)', async () => {
    m.recovery.findDueCases.mockResolvedValue([dueCase()]);

    const res = await makeService(m).runAllTenants(NOW);

    expect(res.advanced).toBe(1);
    expect(m.notifications.queueOverdueInvoices).toHaveBeenCalledTimes(1);
    const [[dtos]] = m.notifications.queueOverdueInvoices.mock.calls;
    expect(dtos[0]).toMatchObject({ id: 'inv1', step: 1 });
    expect(dtos[0].message).toContain('em aberto');
    expect(m.recovery.recordAttemptAndAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case1', step: 1, action: 'remind', reliefOffered: false })
    );
  });

  it('hesitação (opens>=limiar, alívio ligado) → offer_relief', async () => {
    m.recovery.findDueCases.mockResolvedValue([dueCase()]);
    m.negotiation.getRules.mockResolvedValue({ enabled: true, hesitationOpens: 3 });
    m.events.countsByInvoice.mockResolvedValue({ open: 3 });

    await makeService(m).runAllTenants(NOW);

    const [[dtos]] = m.notifications.queueOverdueInvoices.mock.calls;
    expect(dtos[0].message).toContain('facilitar');
    expect(m.recovery.recordAttemptAndAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'offer_relief', reliefOffered: true })
    );
  });

  it('passos esgotados → give_up: marca perdido e NÃO enfileira (RN-3307)', async () => {
    m.recovery.findDueCases.mockResolvedValue([dueCase({ currentStep: 4 })]);

    const res = await makeService(m).runAllTenants(NOW);

    expect(res.lost).toBe(1);
    expect(res.advanced).toBe(0);
    expect(m.recovery.markLost).toHaveBeenCalledWith('case1');
    expect(m.notifications.queueOverdueInvoices).not.toHaveBeenCalled();
  });

  it('closeCase delega ao repositório (RN-3306, idempotente)', async () => {
    const svc = makeService(m);
    const out = await svc.closeCase('inv1', 'paid');
    expect(out).toEqual({ closed: true });
    expect(m.recovery.closeByInvoiceId).toHaveBeenCalledWith('inv1', 'paid');
  });

  it('listCases/getCase/cancelCase delegam ao repositório (API do dono)', async () => {
    const svc = makeService(m);
    m.recovery.listForTenant.mockResolvedValue([{ id: 'case1' }]);
    m.recovery.findByIdForTenant.mockResolvedValue({ id: 'case1' });

    expect(await svc.listCases()).toEqual([{ id: 'case1' }]);
    expect(await svc.getCase('case1')).toEqual({ id: 'case1' });
    expect(await svc.cancelCase('case1')).toEqual({ cancelled: true });
    expect(m.recovery.findByIdForTenant).toHaveBeenCalledWith('case1');
    expect(m.recovery.cancelById).toHaveBeenCalledWith('case1');
  });
});
