import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvoiceService } from '../../src/services/invoice.service.js';

function makeService() {
  const invoiceRepository = {
    create: vi.fn(),
    findByGatewayId: vi.fn(),
    updateStatus: vi.fn(),
    findPendingInvoices: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
  };
  const webhookEvents = { recordIfNew: vi.fn() };
  const gateway = { name: 'mock', createCharge: vi.fn(), verifyAndParseWebhook: vi.fn() };

  const service = new InvoiceService({
    invoiceRepository: invoiceRepository as any,
    webhookEvents: webhookEvents as any,
    gateway: gateway as any,
  });

  return { service, invoiceRepository, webhookEvents, gateway };
}

describe('InvoiceService.createPayment', () => {
  it('cria a cobrança no gateway e persiste os dados retornados', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    gateway.createCharge.mockResolvedValue({
      gatewayId: 'g1',
      pixCopyPaste: 'pix-copia',
      checkoutUrl: 'https://mp/checkout',
    });
    invoiceRepository.create.mockResolvedValue({ id: 'inv1', status: 'PENDING' });

    const result = await service.createPayment({
      clientId: 'c1',
      value: 100,
      dueDate: new Date('2026-07-10'),
    } as any);

    expect(gateway.createCharge).toHaveBeenCalledOnce();
    const chargeArg = gateway.createCharge.mock.calls[0][0];
    expect(chargeArg.amount).toBe(100);
    expect(typeof chargeArg.reference).toBe('string');

    const createArg = invoiceRepository.create.mock.calls[0][0];
    expect(createArg.gatewayId).toBe('g1');
    expect(createArg.pixCopyPaste).toBe('pix-copia');
    expect(createArg.checkoutUrl).toBe('https://mp/checkout');
    expect(result).toEqual({ id: 'inv1', status: 'PENDING' });
  });
});

describe('InvoiceService.applyWebhook (idempotência)', () => {
  it('lança quando a fatura não é encontrada (RN-I3)', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue(null);

    await expect(
      service.applyWebhook({ gatewayId: 'x', status: 'PAID' })
    ).rejects.toThrow('não encontrada');
    expect(invoiceRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('atualiza o status quando o evento é novo', async () => {
    const { service, invoiceRepository, webhookEvents } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1' });
    webhookEvents.recordIfNew.mockResolvedValue(true);
    invoiceRepository.updateStatus.mockResolvedValue({ id: 'inv1', status: 'PAID' });

    const paidAt = new Date('2026-07-01T12:00:00Z');
    const result = await service.applyWebhook({
      eventId: 'evt1',
      gatewayId: 'g1',
      status: 'PAID',
      paidAt,
    });

    expect(webhookEvents.recordIfNew).toHaveBeenCalledWith('evt1', 'gateway');
    expect(invoiceRepository.updateStatus).toHaveBeenCalledWith('inv1', 'PAID', paidAt);
    expect(result.duplicate).toBe(false);
  });

  it('não reaplica quando o evento é duplicado (RN-P3)', async () => {
    const { service, invoiceRepository, webhookEvents } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1' });
    webhookEvents.recordIfNew.mockResolvedValue(false);

    const result = await service.applyWebhook({
      eventId: 'evt1',
      gatewayId: 'g1',
      status: 'PAID',
    });

    expect(result.duplicate).toBe(true);
    expect(invoiceRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('sem eventId, atualiza sem checar idempotência', async () => {
    const { service, invoiceRepository, webhookEvents } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1' });
    invoiceRepository.updateStatus.mockResolvedValue({ id: 'inv1', status: 'PAID' });

    const result = await service.applyWebhook({ gatewayId: 'g1', status: 'PAID' });

    expect(webhookEvents.recordIfNew).not.toHaveBeenCalled();
    expect(invoiceRepository.updateStatus).toHaveBeenCalled();
    expect(result.duplicate).toBe(false);
  });
});

describe('InvoiceService.findPendingInvoices', () => {
  it('delega paginação ao repositório', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findPendingInvoices.mockResolvedValue({ invoices: [], meta: {} });
    await service.findPendingInvoices(2, 5);
    expect(invoiceRepository.findPendingInvoices).toHaveBeenCalledWith(2, 5);
  });
});

describe('InvoiceService.listInvoices', () => {
  it('delega paginação e filtro de status ao repositório', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findAll.mockResolvedValue({ invoices: [], meta: {} });
    await service.listInvoices(2, 5, 'PAID');
    expect(invoiceRepository.findAll).toHaveBeenCalledWith(2, 5, 'PAID');
  });
});

describe('InvoiceService.getInvoiceById', () => {
  it('retorna a fatura quando existe', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findById.mockResolvedValue({ id: 'inv1', status: 'PAID' });
    const result = await service.getInvoiceById('inv1');
    expect(invoiceRepository.findById).toHaveBeenCalledWith('inv1');
    expect(result).toEqual({ id: 'inv1', status: 'PAID' });
  });

  it('retorna null quando não existe', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findById.mockResolvedValue(null);
    const result = await service.getInvoiceById('naoexiste');
    expect(result).toBeNull();
  });
});
