import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InvoiceService } from '../../src/services/invoice.service.js';

function makeService() {
  const invoiceRepository = {
    create: vi.fn(),
    attachCharge: vi.fn(),
    deleteById: vi.fn(),
    applyWebhookAtomic: vi.fn(),
    findByGatewayId: vi.fn(),
    updateStatus: vi.fn(),
    findPendingInvoices: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findBySubscriptionPeriod: vi.fn(),
  };
  const gateway = { name: 'mock', createCharge: vi.fn(), verifyAndParseWebhook: vi.fn() };

  const service = new InvoiceService({
    invoiceRepository: invoiceRepository as any,
    gateway: gateway as any,
  });

  return { service, invoiceRepository, gateway };
}

describe('InvoiceService.createPayment', () => {
  it('reserva a fatura, cria a cobrança e anexa os dados do gateway', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.create.mockResolvedValue({ id: 'inv1', status: 'PENDING' });
    gateway.createCharge.mockResolvedValue({
      gatewayId: 'g1',
      pixCopyPaste: 'pix-copia',
      checkoutUrl: 'https://mp/checkout',
    });
    invoiceRepository.attachCharge.mockResolvedValue({
      id: 'inv1',
      status: 'PENDING',
      gatewayId: 'g1',
    });

    const result = await service.createPayment({
      clientId: 'c1',
      value: 100,
      dueDate: new Date('2026-07-10'),
    } as any);

    // A reserva NÃO leva dados de gateway (só depois, no attachCharge).
    const createArg = invoiceRepository.create.mock.calls[0][0];
    expect(createArg.gatewayId).toBeUndefined();
    expect(Number(createArg.value)).toBe(100);

    expect(gateway.createCharge).toHaveBeenCalledOnce();
    const chargeArg = gateway.createCharge.mock.calls[0][0];
    expect(chargeArg.amount).toBe(100);
    expect(typeof chargeArg.reference).toBe('string');

    const attachArgs = invoiceRepository.attachCharge.mock.calls[0];
    expect(attachArgs[0]).toBe('inv1');
    expect(attachArgs[1].gatewayId).toBe('g1');
    expect(attachArgs[1].pixCopyPaste).toBe('pix-copia');
    expect(result).toEqual({ id: 'inv1', status: 'PENDING', gatewayId: 'g1' });
  });

  it('desfaz a reserva se o gateway falhar (evita cobrança órfã)', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.create.mockResolvedValue({ id: 'inv1' });
    gateway.createCharge.mockRejectedValue(new Error('gateway down'));
    invoiceRepository.deleteById.mockResolvedValue({});

    await expect(
      service.createPayment({ clientId: 'c1', value: 100, dueDate: new Date() } as any)
    ).rejects.toThrow('gateway down');

    expect(invoiceRepository.deleteById).toHaveBeenCalledWith('inv1');
    expect(invoiceRepository.attachCharge).not.toHaveBeenCalled();
  });
});

describe('InvoiceService.createForSubscription (recorrente)', () => {
  it('não cria nem chama o gateway quando a competência já foi gerada (idempotência)', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.findBySubscriptionPeriod.mockResolvedValue({ id: 'inv-existente' });

    const result = await service.createForSubscription({
      subscriptionId: 's1',
      clientId: 'c1',
      description: 'Mensalidade',
      amount: 100,
      dueDate: new Date('2026-07-10'),
      period: '2026-07',
    });

    expect(result.created).toBe(false);
    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(invoiceRepository.create).not.toHaveBeenCalled();
  });

  it('reserva, gera a fatura com item único e vincula subscriptionId/period', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.findBySubscriptionPeriod.mockResolvedValue(null);
    invoiceRepository.create.mockResolvedValue({ id: 'inv1', status: 'PENDING' });
    gateway.createCharge.mockResolvedValue({ gatewayId: 'g1', pixCopyPaste: 'pix' });
    invoiceRepository.attachCharge.mockResolvedValue({ id: 'inv1', gatewayId: 'g1' });

    const result = await service.createForSubscription({
      subscriptionId: 's1',
      clientId: 'c1',
      description: 'Mensalidade',
      amount: 100,
      dueDate: new Date('2026-07-10'),
      period: '2026-07',
    });

    const createArg = invoiceRepository.create.mock.calls[0][0];
    expect(createArg.subscriptionId).toBe('s1');
    expect(createArg.period).toBe('2026-07');
    expect(Number(createArg.value)).toBe(100);
    expect(createArg.items).toEqual([{ description: 'Mensalidade', quantity: 1, unitPrice: 100 }]);
    expect(createArg.gatewayId).toBeUndefined(); // reserva sem gateway
    expect(gateway.createCharge).toHaveBeenCalledOnce();
    expect(invoiceRepository.attachCharge).toHaveBeenCalledOnce();
    expect(result.created).toBe(true);
  });

  it('em corrida na reserva (unique/P2002), NÃO chama o gateway e devolve a existente', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.findBySubscriptionPeriod
      .mockResolvedValueOnce(null) // 1ª checagem: ainda não existe
      .mockResolvedValueOnce({ id: 'inv-corrida' }); // re-find após o P2002
    invoiceRepository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );

    const result = await service.createForSubscription({
      subscriptionId: 's1',
      clientId: 'c1',
      description: 'Mensalidade',
      amount: 100,
      dueDate: new Date('2026-07-10'),
      period: '2026-07',
    });

    expect(gateway.createCharge).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, invoice: { id: 'inv-corrida' } });
  });

  it('desfaz a reserva se o gateway falhar', async () => {
    const { service, invoiceRepository, gateway } = makeService();
    invoiceRepository.findBySubscriptionPeriod.mockResolvedValue(null);
    invoiceRepository.create.mockResolvedValue({ id: 'inv1' });
    gateway.createCharge.mockRejectedValue(new Error('gateway down'));
    invoiceRepository.deleteById.mockResolvedValue({});

    await expect(
      service.createForSubscription({
        subscriptionId: 's1',
        clientId: 'c1',
        description: 'Mensalidade',
        amount: 100,
        dueDate: new Date('2026-07-10'),
        period: '2026-07',
      })
    ).rejects.toThrow('gateway down');

    expect(invoiceRepository.deleteById).toHaveBeenCalledWith('inv1');
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

  it('aplica de forma atômica quando o evento é novo', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1', status: 'PENDING' });
    invoiceRepository.applyWebhookAtomic.mockResolvedValue({
      duplicate: false,
      invoice: { id: 'inv1', status: 'PAID' },
    });

    const paidAt = new Date('2026-07-01T12:00:00Z');
    const result = await service.applyWebhook({
      eventId: 'evt1',
      gatewayId: 'g1',
      status: 'PAID',
      paidAt,
    });

    expect(invoiceRepository.applyWebhookAtomic).toHaveBeenCalledWith({
      invoiceId: 'inv1',
      eventId: 'evt1',
      provider: 'gateway',
      status: 'PAID',
      paidAt,
    });
    expect(result.duplicate).toBe(false);
  });

  it('propaga duplicate=true quando o evento já foi processado (RN-P3)', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1', status: 'PENDING' });
    invoiceRepository.applyWebhookAtomic.mockResolvedValue({
      duplicate: true,
      invoice: { id: 'inv1' },
    });

    const result = await service.applyWebhook({ eventId: 'evt1', gatewayId: 'g1', status: 'PAID' });

    expect(result.duplicate).toBe(true);
  });

  it('sem eventId, ainda aplica atomicamente (eventId undefined)', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1', status: 'PENDING' });
    invoiceRepository.applyWebhookAtomic.mockResolvedValue({ duplicate: false, invoice: {} });

    await service.applyWebhook({ gatewayId: 'g1', status: 'PAID' });

    expect(invoiceRepository.applyWebhookAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv1', eventId: undefined, status: 'PAID' })
    );
  });

  it('NÃO regride uma fatura já PAID (guarda de ordem)', async () => {
    const { service, invoiceRepository } = makeService();
    invoiceRepository.findByGatewayId.mockResolvedValue({ id: 'inv1', status: 'PAID' });

    const result = await service.applyWebhook({
      eventId: 'evt-antigo',
      gatewayId: 'g1',
      status: 'PENDING',
    });

    expect(result.duplicate).toBe(false);
    expect(invoiceRepository.applyWebhookAtomic).not.toHaveBeenCalled();
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
