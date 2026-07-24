import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessIntegrationService } from '../../src/services/access-integration.service.js';
import { runWithTenant } from '../../src/context/tenant-context.js';

// Sinais padrão de um cliente (o sweep roda decideAccess em cima disso).
const settings = { enabled: true, graceDays: 3, requireSignedContract: false };

function makeMocks() {
  return {
    repo: {
      get: vi.fn().mockResolvedValue({ enabled: true, webhookUrl: 'https://x/hook', webhookSecret: 's' }),
      upsert: vi.fn().mockResolvedValue({}),
      findByApiKeyHash: vi.fn(),
      createEvent: vi.fn().mockResolvedValue({}),
      listEvents: vi.fn().mockResolvedValue([]),
    },
    access: {
      getSettings: vi.fn().mockResolvedValue(settings),
      findAccessInputs: vi.fn().mockResolvedValue([]),
      updateClientState: vi.fn().mockResolvedValue(undefined),
    },
    accounts: { findActiveTenantIds: vi.fn().mockResolvedValue(['t1']) },
    dispatch: vi.fn().mockResolvedValue({ status: 'sent', code: 200 }),
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new AccessIntegrationService(m as any);
const client = (over: any = {}) => ({
  clientId: 'c1', name: 'Cliente', override: null,
  hasOverdue: false, maxDaysOverdue: 0, contractAccepted: true, previousState: null,
  ...over,
});

describe('AccessIntegrationService (spec 0043 — F13)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('rotateApiKey devolve a chave crua uma vez e guarda só o hash', async () => {
    const { apiKey, apiKeyPrefix } = await runWithTenant('t1', () => svc(m).rotateApiKey());
    expect(apiKey.startsWith('adk_')).toBe(true);
    expect(apiKeyPrefix).toBe(apiKey.slice(0, 12));
    const saved = m.repo.upsert.mock.calls[0][0];
    expect(saved.apiKeyHash).toBeTruthy();
    expect(saved.apiKeyHash).not.toContain(apiKey); // é hash, não a chave
  });

  it('baseline: cliente novo em dia (null→allowed) NÃO gera evento nem webhook', async () => {
    m.access.findAccessInputs.mockResolvedValue([client({ previousState: null, hasOverdue: false })]);
    const r = await runWithTenant('t1', () => svc(m).runForTenant('t1', new Date()));
    expect(r.transitions).toBe(0);
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.access.updateClientState).toHaveBeenCalledWith('c1', 'allowed'); // persiste baseline
  });

  it('transição para blocked gera evento e dispara webhook assinado', async () => {
    m.access.findAccessInputs.mockResolvedValue([
      client({ previousState: 'allowed', hasOverdue: true, maxDaysOverdue: 10 }),
    ]);
    const r = await runWithTenant('t1', () => svc(m).runForTenant('t1', new Date()));
    expect(r.transitions).toBe(1);
    expect(r.sent).toBe(1);
    expect(m.dispatch).toHaveBeenCalledOnce();
    const [url, secret, payload] = m.dispatch.mock.calls[0];
    expect(url).toBe('https://x/hook');
    expect(secret).toBe('s');
    expect(payload).toMatchObject({ clientId: 'c1', state: 'blocked', granted: false, previousState: 'allowed' });
    expect(m.repo.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ toState: 'blocked', fromState: 'allowed', webhookStatus: 'sent', webhookCode: 200 }),
    );
  });

  it('sem estado mudando → nenhum evento (idempotente entre sweeps)', async () => {
    m.access.findAccessInputs.mockResolvedValue([client({ previousState: 'allowed', hasOverdue: false })]);
    const r = await runWithTenant('t1', () => svc(m).runForTenant('t1', new Date()));
    expect(r.transitions).toBe(0);
    expect(m.access.updateClientState).not.toHaveBeenCalled(); // já estava allowed
  });

  it('webhook não configurado → registra transição como skipped, sem disparo', async () => {
    m.repo.get.mockResolvedValue({ enabled: false, webhookUrl: null, webhookSecret: null });
    m.access.findAccessInputs.mockResolvedValue([
      client({ previousState: 'allowed', hasOverdue: true, maxDaysOverdue: 10 }),
    ]);
    const r = await runWithTenant('t1', () => svc(m).runForTenant('t1', new Date()));
    expect(r.transitions).toBe(1);
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ webhookStatus: 'skipped' }));
  });

  it('computeClientAccess (PULL da catraca) devolve granted do domínio', async () => {
    m.access.findAccessInputs.mockResolvedValue([client({ hasOverdue: true, maxDaysOverdue: 10 })]);
    const res = await runWithTenant('t1', () => svc(m).computeClientAccess('c1'));
    expect(res).toMatchObject({ clientId: 'c1', state: 'blocked', granted: false });
    expect(m.access.findAccessInputs).toHaveBeenCalledWith(expect.any(Date), 'c1'); // escopado
  });

  it('computeClientAccess devolve null se o cliente não existe', async () => {
    m.access.findAccessInputs.mockResolvedValue([]);
    const res = await runWithTenant('t1', () => svc(m).computeClientAccess('cX'));
    expect(res).toBeNull();
  });

  it('runAllTenants soma os resultados por tenant', async () => {
    m.accounts.findActiveTenantIds.mockResolvedValue(['t1', 't2']);
    m.access.findAccessInputs.mockResolvedValue([
      client({ previousState: 'allowed', hasOverdue: true, maxDaysOverdue: 10 }),
    ]);
    const r = await svc(m).runAllTenants(new Date());
    expect(r.tenants).toBe(2);
    expect(r.transitions).toBe(2);
    expect(r.sent).toBe(2);
  });
});
