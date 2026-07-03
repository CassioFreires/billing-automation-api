import { describe, it, expect, vi } from 'vitest';
import { NotificationSchedulerService } from '../../src/services/notification-scheduler.service.js';

function make() {
  const accounts = { findActiveTenantIds: vi.fn() };
  const invoices = { findPendingInvoices: vi.fn() };
  const notifications = { queueOverdueInvoices: vi.fn() };
  const service = new NotificationSchedulerService({
    accounts: accounts as any,
    invoices: invoices as any,
    notifications: notifications as any,
  });
  return { service, accounts, invoices, notifications };
}

const overdue = (n: number) => ({
  invoices: Array.from({ length: n }, (_, i) => ({
    id: `inv-${i}`,
    status: 'PENDING',
    value: 100,
    client: { name: 'Cliente', phone: '5511999999999', document: '12345678901' },
  })),
  meta: {},
});

describe('NotificationSchedulerService.runAllTenants', () => {
  it('enfileira os vencidos de cada tenant e agrega os totais', async () => {
    const { service, accounts, invoices, notifications } = make();
    accounts.findActiveTenantIds.mockResolvedValue(['t1', 't2']);
    invoices.findPendingInvoices
      .mockResolvedValueOnce(overdue(2)) // t1: 2 vencidos
      .mockResolvedValueOnce(overdue(0)); // t2: nenhum
    notifications.queueOverdueInvoices.mockImplementation((dtos: unknown[]) =>
      Promise.resolve({ enqueued: dtos.length })
    );

    const result = await service.runAllTenants();

    expect(result).toEqual({ tenants: 2, comVencidos: 1, enfileirados: 2 });
    expect(notifications.queueOverdueInvoices).toHaveBeenCalledTimes(1); // só t1
    const dtos = notifications.queueOverdueInvoices.mock.calls[0][0];
    expect(dtos[0]).toMatchObject({ id: 'inv-0', phone: '5511999999999', clientName: 'Cliente' });
  });

  it('não enfileira nada quando nenhum tenant tem vencidos', async () => {
    const { service, accounts, invoices, notifications } = make();
    accounts.findActiveTenantIds.mockResolvedValue(['t1']);
    invoices.findPendingInvoices.mockResolvedValue(overdue(0));

    const result = await service.runAllTenants();

    expect(result).toEqual({ tenants: 1, comVencidos: 0, enfileirados: 0 });
    expect(notifications.queueOverdueInvoices).not.toHaveBeenCalled();
  });
});
