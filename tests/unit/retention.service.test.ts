import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetentionService,
  NotFoundError,
  ConflictError,
} from '../../src/services/retention.service.js';

function makeMocks() {
  return {
    repo: {
      findSubscriptionWithHealth: vi.fn(),
      createRequest: vi.fn(),
      findByIdForTenant: vi.fn(),
      resolve: vi.fn(),
      listForTenant: vi.fn().mockResolvedValue([]),
    },
  };
}
const svc = (m: ReturnType<typeof makeMocks>) => new RetentionService(m as any);

describe('RetentionService (spec 0037 — F11)', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => (m = makeMocks()));

  it('abre pedido e recomenda oferta pelo motivo + saúde (RN-3701/3702)', async () => {
    m.repo.findSubscriptionWithHealth.mockResolvedValue({
      id: 'sub1', status: 'ACTIVE', clientId: 'c1', clientName: 'Maria', healthBand: 'healthy', tenantId: 't1',
    });
    m.repo.createRequest.mockResolvedValue({ id: 'req1', reason: 'preco' });

    const out = await svc(m).openRequest('sub1', 'preco');

    expect(out.recommended).toBe('discount'); // preço + saudável → desconto
    expect(m.repo.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub1', clientId: 'c1', tenantId: 't1', recommended: 'discount' })
    );
  });

  it('preço + at_risk → recomenda pausar', async () => {
    m.repo.findSubscriptionWithHealth.mockResolvedValue({
      id: 'sub1', status: 'ACTIVE', clientId: 'c1', clientName: 'Zé', healthBand: 'at_risk', tenantId: 't1',
    });
    m.repo.createRequest.mockResolvedValue({ id: 'req1', reason: 'preco' });
    const out = await svc(m).openRequest('sub1', 'preco');
    expect(out.recommended).toBe('pause');
  });

  it('assinatura inexistente → 404', async () => {
    m.repo.findSubscriptionWithHealth.mockResolvedValue(null);
    await expect(svc(m).openRequest('x', 'outro')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolve saved+pause aplica a oferta e grava desfecho', async () => {
    m.repo.findByIdForTenant.mockResolvedValue({ id: 'req1', status: 'open', recommended: 'pause', subscriptionId: 'sub1' });
    m.repo.resolve.mockResolvedValue({ id: 'req1', status: 'saved', saveOffer: 'pause' });

    const out = await svc(m).resolveRequest('req1', 'saved', 'pause');

    expect(out).toEqual({ id: 'req1', status: 'saved', saveOffer: 'pause' });
    expect(m.repo.resolve).toHaveBeenCalledWith('req1', 'saved', 'pause', 'sub1');
  });

  it('resolve sem oferta usa a recomendada', async () => {
    m.repo.findByIdForTenant.mockResolvedValue({ id: 'req1', status: 'open', recommended: 'pause', subscriptionId: 'sub1' });
    m.repo.resolve.mockResolvedValue({ id: 'req1', status: 'saved', saveOffer: 'pause' });
    await svc(m).resolveRequest('req1', 'saved');
    expect(m.repo.resolve).toHaveBeenCalledWith('req1', 'saved', 'pause', 'sub1');
  });

  it('cancelled não aplica oferta (offer null)', async () => {
    m.repo.findByIdForTenant.mockResolvedValue({ id: 'req1', status: 'open', recommended: 'pause', subscriptionId: 'sub1' });
    m.repo.resolve.mockResolvedValue({ id: 'req1', status: 'cancelled', saveOffer: null });
    await svc(m).resolveRequest('req1', 'cancelled');
    expect(m.repo.resolve).toHaveBeenCalledWith('req1', 'cancelled', null, 'sub1');
  });

  it('pedido já resolvido → 409 (idempotente, RN-3703)', async () => {
    m.repo.findByIdForTenant.mockResolvedValue({ id: 'req1', status: 'saved', subscriptionId: 'sub1' });
    await expect(svc(m).resolveRequest('req1', 'cancelled')).rejects.toBeInstanceOf(ConflictError);
  });

  it('pedido inexistente → 404', async () => {
    m.repo.findByIdForTenant.mockResolvedValue(null);
    await expect(svc(m).resolveRequest('x', 'saved')).rejects.toBeInstanceOf(NotFoundError);
  });
});
