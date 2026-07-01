import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findByGatewayId: vi.fn(),
  updateStatus: vi.fn(),
  findPendingInvoices: vi.fn(),
}));

vi.mock('../../src/repositories/invoice.repository.js', () => ({
  InvoiceRepository: class {
    create = mocks.create;
    findByGatewayId = mocks.findByGatewayId;
    updateStatus = mocks.updateStatus;
    findPendingInvoices = mocks.findPendingInvoices;
  },
}));

const { InvoiceService } = await import('../../src/services/invoice.service.js');

describe('InvoiceService', () => {
  let service: InstanceType<typeof InvoiceService>;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    service = new InvoiceService();
  });

  it('createPayment: persiste com gatewayId e pixCopyPaste gerados', async () => {
    mocks.create.mockResolvedValue({ id: 'inv1', status: 'PENDING' });

    const result = await service.createPayment({
      clientId: 'c1',
      value: 100,
      dueDate: new Date('2026-07-10'),
    } as any);

    expect(mocks.create).toHaveBeenCalledOnce();
    const arg = mocks.create.mock.calls[0][0];
    expect(arg.clientId).toBe('c1');
    expect(arg.gatewayId).toMatch(/^pay_/);
    expect(arg.pixCopyPaste).toBeTruthy();
    expect(result).toEqual({ id: 'inv1', status: 'PENDING' });
  });

  it('receiveWebhookNotification: lança quando gateway não encontrado (RN-I3)', async () => {
    mocks.findByGatewayId.mockResolvedValue(null);

    await expect(
      service.receiveWebhookNotification({ gatewayId: 'x', status: 'PAID' } as any)
    ).rejects.toThrow('Fatura correspondente ao Gateway não encontrada.');

    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('receiveWebhookNotification: atualiza status da fatura encontrada', async () => {
    const paidAt = new Date('2026-07-01T12:00:00Z');
    mocks.findByGatewayId.mockResolvedValue({ id: 'inv1' });
    mocks.updateStatus.mockResolvedValue({ id: 'inv1', status: 'PAID' });

    const result = await service.receiveWebhookNotification({
      gatewayId: 'gw1',
      status: 'PAID',
      paidAt,
    } as any);

    expect(mocks.updateStatus).toHaveBeenCalledWith('inv1', 'PAID', paidAt);
    expect(result).toEqual({ id: 'inv1', status: 'PAID' });
  });

  it('findPendingInvoices: delega paginação ao repositório', async () => {
    mocks.findPendingInvoices.mockResolvedValue({ invoices: [], meta: {} });
    await service.findPendingInvoices(2, 5);
    expect(mocks.findPendingInvoices).toHaveBeenCalledWith(2, 5);
  });
});
