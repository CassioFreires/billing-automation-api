import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  findNotificationDataById: vi.fn(),
}));

vi.mock('../../src/messaging/publish/publish.messaging.js', () => ({
  publishRabbitMql: mocks.publish,
}));

vi.mock('../../src/repositories/invoice.repository.js', () => ({
  InvoiceRepository: class {
    findNotificationDataById = mocks.findNotificationDataById;
  },
}));

const { NotificationService } = await import('../../src/services/notication.service.js');
const { INVOICE_QUEUE } = await import('../../src/messaging/invoice-queue.js');

describe('NotificationService', () => {
  let service: InstanceType<typeof NotificationService>;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.publish.mockResolvedValue(undefined);
    service = new NotificationService();
  });

  it('queueOverdueInvoices: enfileira cada fatura e retorna a contagem', async () => {
    const invoices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any;

    const result = await service.queueOverdueInvoices(invoices);

    expect(result).toEqual({ enqueued: 3 });
    expect(mocks.publish).toHaveBeenCalledTimes(3);
    // publica na fila correta, com JSON
    expect(mocks.publish).toHaveBeenCalledWith(INVOICE_QUEUE, JSON.stringify({ id: 'a' }));
  });

  it('triggerByInvoice: lança INVOICE_NOT_FOUND e não enfileira (RN-N3)', async () => {
    mocks.findNotificationDataById.mockResolvedValue(null);

    await expect(service.triggerByInvoice('x')).rejects.toThrow('INVOICE_NOT_FOUND');
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('triggerByInvoice: enfileira quando a fatura existe', async () => {
    const data = { id: 'inv1', phone: '11999999999' };
    mocks.findNotificationDataById.mockResolvedValue(data);

    await service.triggerByInvoice('inv1');

    expect(mocks.publish).toHaveBeenCalledWith(INVOICE_QUEUE, JSON.stringify(data));
  });

  it('sendNotificationByUser: enfileira o payload recebido', async () => {
    const data = { id: 'inv2' } as any;
    await service.sendNotificationByUser(data);
    expect(mocks.publish).toHaveBeenCalledWith(INVOICE_QUEUE, JSON.stringify(data));
  });
});
