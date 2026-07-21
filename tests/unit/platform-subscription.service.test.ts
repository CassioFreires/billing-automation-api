import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlatformSubscriptionService } from '../../src/services/platform-subscription.service.js';
import { runWithTenant } from '../../src/context/tenant-context.js';

function make() {
  const subs = {
    findByTenant: vi.fn(),
    findByTenantId: vi.fn(),
    update: vi.fn(),
    findDueForRenewal: vi.fn(),
  };
  const invoices = {
    create: vi.fn(),
    findByGatewayId: vi.fn(),
    confirmPaidAtomic: vi.fn(),
    listByTenant: vi.fn(),
  };
  const tenantInvoices = { countCreatedThisMonth: vi.fn() };
  const service = new PlatformSubscriptionService({
    subs: subs as any,
    invoices: invoices as any,
    tenantInvoices: tenantInvoices as any,
  });
  return { service, subs, invoices, tenantInvoices };
}

const future = new Date(Date.now() + 5 * 86400000);

afterEach(() => vi.unstubAllGlobals());

describe('PlatformSubscriptionService.entitlementsForCurrentTenant', () => {
  it('trial vigente → escrita liberada (Pro)', async () => {
    const { service, subs } = make();
    subs.findByTenant.mockResolvedValue({ plan: 'pro', status: 'trialing', trialEndsAt: future, currentPeriodEnd: null });
    const ent = await runWithTenant('t1', () => service.entitlementsForCurrentTenant());
    expect(ent.canWrite).toBe(true);
    expect(ent.features.reliefButton).toBe(true);
  });
});

describe('PlatformSubscriptionService.checkout', () => {
  it('free → troca imediata (sem cobrança)', async () => {
    const { service, subs, invoices } = make();
    subs.update.mockResolvedValue({});
    const res = await runWithTenant('t1', () => service.checkout('free'));
    expect(res.switched).toBe(true);
    expect(subs.update).toHaveBeenCalledWith('t1', expect.objectContaining({ plan: 'free', status: 'active' }));
    expect(invoices.create).not.toHaveBeenCalled();
  });

  it('pago → cria PlatformInvoice e cobra via gateway de plataforma (mock)', async () => {
    const { service, invoices } = make();
    invoices.create.mockResolvedValue({ id: 'pi_1' });
    const res = await runWithTenant('t1', () => service.checkout('pro'));
    expect(res.switched).toBe(false);
    expect(res.platformInvoiceId).toBe('pi_1');
    // Mock gateway devolve PIX (sem checkout hospedado).
    expect(res.pixCopyPaste).toBeTruthy();
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro', amountCents: 19900 })
    );
  });

  it('plano inválido → erro', async () => {
    const { service } = make();
    await expect(runWithTenant('t1', () => service.checkout('ouro' as any))).rejects.toThrow();
  });
});

describe('PlatformSubscriptionService.confirmPayment (webhook mock)', () => {
  it('assinatura válida + PAID → ativa a assinatura', async () => {
    process.env.WEBHOOK_SECRET = 'sec';
    const { service, invoices } = make();
    invoices.findByGatewayId.mockResolvedValue({ id: 'pi_1', tenantId: 't1', plan: 'pro' });
    invoices.confirmPaidAtomic.mockResolvedValue({ duplicate: false });

    const res = await service.confirmPayment('mock', {
      headers: { 'x-webhook-secret': 'sec' },
      query: {},
      body: { gatewayId: 'g1', status: 'PAID', eventId: 'e1' },
    });

    expect(res.ignored).toBe(false);
    expect(invoices.confirmPaidAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'pi_1', tenantId: 't1', plan: 'pro' })
    );
  });

  it('evento não-PAID → ignorado (não ativa)', async () => {
    process.env.WEBHOOK_SECRET = 'sec';
    const { service, invoices } = make();
    const res = await service.confirmPayment('mock', {
      headers: { 'x-webhook-secret': 'sec' },
      query: {},
      body: { gatewayId: 'g1', status: 'FAILED' },
    });
    expect(res.ignored).toBe(true);
    expect(invoices.confirmPaidAtomic).not.toHaveBeenCalled();
  });
});

describe('PlatformSubscriptionService.getStatus', () => {
  it('calcula uso (faturas do mês vs limite)', async () => {
    const { service, subs, tenantInvoices } = make();
    subs.findByTenant.mockResolvedValue({ plan: 'essencial', status: 'active', trialEndsAt: null, currentPeriodEnd: future });
    tenantInvoices.countCreatedThisMonth.mockResolvedValue(5);
    const status = await runWithTenant('t1', () => service.getStatus());
    expect(status.usage.invoicesThisMonth).toBe(5);
    expect(status.usage.maxInvoicesPerMonth).toBe(200);
    expect(status.usage.overQuota).toBe(false);
    expect(status.catalog.length).toBe(3);
  });
});
