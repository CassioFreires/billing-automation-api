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
const { runWithTenant } = await import('../../src/context/tenant-context.js');

const TENANT = 'tenant-1';

describe('NotificationService', () => {
  let service: InstanceType<typeof NotificationService>;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.publish.mockResolvedValue(undefined);
    service = new NotificationService();
  });

  it('queueOverdueInvoices: enfileira cada fatura (com tenantId) e retorna a contagem', async () => {
    const invoices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any;

    const result = await runWithTenant(TENANT, () => service.queueOverdueInvoices(invoices));

    expect(result).toEqual({ enqueued: 3 });
    expect(mocks.publish).toHaveBeenCalledTimes(3);
    // publica na fila correta, com o tenant carimbado (RN-T5)
    expect(mocks.publish).toHaveBeenCalledWith(
      INVOICE_QUEUE,
      JSON.stringify({ id: 'a', tenantId: TENANT })
    );
  });

  it('enqueue: falha fora de um contexto de tenant', async () => {
    await expect(service.queueOverdueInvoices([{ id: 'a' }] as any)).rejects.toThrow(
      'TENANT_CONTEXT_MISSING'
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('triggerByInvoice: lança INVOICE_NOT_FOUND e não enfileira (RN-N3)', async () => {
    mocks.findNotificationDataById.mockResolvedValue(null);

    await expect(runWithTenant(TENANT, () => service.triggerByInvoice('x'))).rejects.toThrow(
      'INVOICE_NOT_FOUND'
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('triggerByInvoice: enfileira quando a fatura existe', async () => {
    const data = { id: 'inv1', phone: '11999999999' };
    mocks.findNotificationDataById.mockResolvedValue(data);

    await runWithTenant(TENANT, () => service.triggerByInvoice('inv1'));

    expect(mocks.publish).toHaveBeenCalledWith(
      INVOICE_QUEUE,
      JSON.stringify({ ...data, tenantId: TENANT })
    );
  });

  it('sendNotificationByUser: enfileira o payload recebido com tenantId', async () => {
    const data = { id: 'inv2' } as any;
    await runWithTenant(TENANT, () => service.sendNotificationByUser(data));
    expect(mocks.publish).toHaveBeenCalledWith(
      INVOICE_QUEUE,
      JSON.stringify({ id: 'inv2', tenantId: TENANT })
    );
  });
});
