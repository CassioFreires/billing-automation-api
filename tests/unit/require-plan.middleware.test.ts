import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do service usado pelo middleware (controla entitlements/quota por teste).
const h = vi.hoisted(() => ({
  entitlements: vi.fn(),
  quota: vi.fn(),
}));

vi.mock('../../src/services/platform-subscription.service.js', () => ({
  PlatformSubscriptionService: class {
    entitlementsForCurrentTenant = h.entitlements;
    isInvoiceQuotaExceeded = h.quota;
  },
}));

const { requireWriteAccess, enforceInvoiceQuota } = await import(
  '../../src/middlewares/require-plan.middleware.js'
);

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => {
  h.entitlements.mockReset();
  h.quota.mockReset();
});

describe('requireWriteAccess (spec 0020)', () => {
  it('GET passa sem consultar o plano', async () => {
    const next = vi.fn();
    requireWriteAccess({ method: 'GET' } as any, res() as any, next);
    expect(next).toHaveBeenCalled();
    expect(h.entitlements).not.toHaveBeenCalled();
  });

  it('conta de serviço passa em qualquer método', async () => {
    const next = vi.fn();
    requireWriteAccess({ method: 'POST', auth: { role: 'service' } } as any, res() as any, next);
    expect(next).toHaveBeenCalled();
    expect(h.entitlements).not.toHaveBeenCalled();
  });

  it('POST com plano ativo → next', async () => {
    h.entitlements.mockResolvedValue({ canWrite: true });
    const next = vi.fn();
    requireWriteAccess({ method: 'POST', auth: { role: 'OWNER' } } as any, res() as any, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalled();
  });

  it('POST com plano expirado → 402 PLAN_EXPIRED', async () => {
    h.entitlements.mockResolvedValue({ canWrite: false, reason: 'PLAN_EXPIRED' });
    const next = vi.fn();
    const r = res();
    requireWriteAccess({ method: 'POST', auth: { role: 'OWNER' } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(402);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PLAN_EXPIRED' }));
  });
});

describe('enforceInvoiceQuota (spec 0020)', () => {
  it('dentro da quota → next', async () => {
    h.quota.mockResolvedValue(false);
    const next = vi.fn();
    enforceInvoiceQuota({ method: 'POST', auth: { role: 'OWNER' } } as any, res() as any, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalled();
  });

  it('quota estourada → 402 PLAN_LIMIT_REACHED', async () => {
    h.quota.mockResolvedValue(true);
    const next = vi.fn();
    const r = res();
    enforceInvoiceQuota({ method: 'POST', auth: { role: 'OWNER' } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(402);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PLAN_LIMIT_REACHED' }));
  });
});
