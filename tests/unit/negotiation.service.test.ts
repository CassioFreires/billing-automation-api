import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NegotiationService } from '../../src/services/negotiation.service.js';

const fullRules = {
  enabled: true,
  hesitationOpens: 3,
  discountEnabled: true,
  discountPercent: 0.1,
  installmentsEnabled: true,
  maxInstallments: 3,
  deferEnabled: true,
  deferMaxDays: 7,
  deferFeePercent: 0.05,
};

function makeDeps(overrides: any = {}) {
  const invoiceRepository = {
    findByLinkToken: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'new1' }),
    attachCharge: vi.fn().mockResolvedValue({ id: 'new1', checkoutUrl: null, pixCopyPaste: 'PIXNEW' }),
    deleteById: vi.fn().mockResolvedValue({}),
    findById: vi.fn(),
    ...overrides.invoiceRepository,
  };
  const agreements = {
    findActiveByOriginal: vi.fn().mockResolvedValue(null),
    finalize: vi.fn().mockResolvedValue({ conflict: false, agreement: { id: 'agr1', newInvoice: { id: 'new1' } } }),
    findByOriginal: vi.fn(),
    ...overrides.agreements,
  };
  const events = { record: vi.fn().mockResolvedValue({}), countsByInvoice: vi.fn().mockResolvedValue({}) };
  const negotiationSettings = { getRules: vi.fn().mockResolvedValue(fullRules), get: vi.fn() };
  const paymentSettings = { getForCurrentTenant: vi.fn().mockResolvedValue({ provider: 'mock' }) };
  const gateway = { name: 'mock', createCharge: vi.fn().mockResolvedValue({ gatewayId: 'pay_x', pixCopyPaste: 'PIXNEW' }), verifyAndParseWebhook: vi.fn() };

  const service = new NegotiationService({
    invoiceRepository: invoiceRepository as any,
    agreements: agreements as any,
    events: events as any,
    negotiationSettings: negotiationSettings as any,
    paymentSettings: paymentSettings as any,
    gateway: gateway as any,
  });
  return { service, invoiceRepository, agreements, gateway };
}

const openInvoice = {
  id: 'inv1',
  tenantId: 't1',
  clientId: 'c1',
  status: 'OVERDUE',
  value: 200,
  dueDate: new Date('2026-07-10T00:00:00Z'),
  checkoutUrl: null,
  pixCopyPaste: 'PIXORIG',
};

describe('NegotiationService.accept (spec 0018 — M2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fatura não elegível (PAID) → NOT_ELIGIBLE, sem cobrança nova', async () => {
    const { service, invoiceRepository, gateway } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue({ ...openInvoice, status: 'PAID' });

    await expect(service.accept('tok', { type: 'discount' } as any)).rejects.toThrow('NOT_ELIGIBLE');
    expect(gateway.createCharge).not.toHaveBeenCalled();
  });

  it('token inexistente → INVOICE_NOT_FOUND', async () => {
    const { service, invoiceRepository } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue(null);
    await expect(service.accept('x', { type: 'discount' } as any)).rejects.toThrow('INVOICE_NOT_FOUND');
  });

  it('idempotente: acordo ativo existente é devolvido sem criar cobrança (RN-NEG3)', async () => {
    const existing = { id: 'agrOld', newInvoice: { id: 'newOld' } };
    const { service, invoiceRepository, gateway, agreements } = makeDeps({
      agreements: { findActiveByOriginal: vi.fn().mockResolvedValue(existing) },
    });
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);

    const res = await service.accept('tok', { type: 'discount' } as any);
    expect(res).toEqual({ created: false, agreement: existing });
    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(agreements.finalize).not.toHaveBeenCalled();
  });

  it('caminho feliz (desconto): cria cobrança nova e finaliza o acordo', async () => {
    const { service, invoiceRepository, gateway, agreements } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);

    const res: any = await service.accept('tok', { type: 'discount' } as any);

    expect(gateway.createCharge).toHaveBeenCalledTimes(1);
    // valor cobrado = 200 - 10% = 180
    expect(gateway.createCharge.mock.calls[0][0].amount).toBe(180);
    expect(agreements.finalize).toHaveBeenCalledTimes(1);
    const fin = agreements.finalize.mock.calls[0][0];
    expect(fin.originalInvoiceId).toBe('inv1');
    expect(fin.newInvoiceId).toBe('new1');
    expect(fin.terms.finalValue).toBe(180);
    expect(res.created).toBe(true);
  });

  it('parcelas acima do teto → 422 (NegotiationRuleError), desfaz nada (nem reservou)', async () => {
    const { service, invoiceRepository, gateway } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);

    await expect(
      service.accept('tok', { type: 'installments', installments: 6 } as any)
    ).rejects.toMatchObject({ name: 'NegotiationRuleError' });
    expect(gateway.createCharge).not.toHaveBeenCalled();
  });

  it('corrida perdida no finalize → desfaz a nova reserva e devolve o acordo vigente', async () => {
    const existing = { id: 'agrRace' };
    const { service, invoiceRepository, agreements } = makeDeps({
      agreements: {
        findActiveByOriginal: vi.fn().mockResolvedValue(null),
        finalize: vi.fn().mockResolvedValue({ conflict: true, agreement: existing }),
      },
    });
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);

    const res = await service.accept('tok', { type: 'discount' } as any);
    expect(res).toEqual({ created: false, agreement: existing });
    expect(invoiceRepository.deleteById).toHaveBeenCalledWith('new1');
  });
});

describe('NegotiationService.getOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fatura hesitando + regras ligadas → opções + reliefAvailable', async () => {
    const { service, invoiceRepository } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);
    // 3 aberturas, 0 pago → hesitando
    (service as any).events.countsByInvoice = vi.fn().mockResolvedValue({ open: 3 });

    const res: any = await service.getOptions('tok');
    expect(res.hesitating).toBe(true);
    expect(res.reliefAvailable).toBe(true);
    expect(res.options.length).toBe(3);
  });

  it('poucas aberturas → sem oferta', async () => {
    const { service, invoiceRepository } = makeDeps();
    invoiceRepository.findByLinkToken.mockResolvedValue(openInvoice);
    (service as any).events.countsByInvoice = vi.fn().mockResolvedValue({ open: 1 });

    const res: any = await service.getOptions('tok');
    expect(res.reliefAvailable).toBe(false);
    expect(res.options).toEqual([]);
  });
});
