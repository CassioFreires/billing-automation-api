import { describe, it, expect, vi } from 'vitest';
import { NotificationSchedulerService } from '../../src/services/notification-scheduler.service.js';

function make() {
  const accounts = { findActiveTenantIds: vi.fn() };
  const invoices = {
    findPendingInvoices: vi.fn(),
    findReguaCandidates: vi.fn(),
    markReminderStep: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = { queueOverdueInvoices: vi.fn() };
  // Régua desligada por padrão → caminho legado nos testes existentes.
  const regua = { get: vi.fn().mockResolvedValue({ enabled: false, steps: [] }) };
  // Recuperação (spec 0033): sem casos ativos por padrão → corte é no-op (sem regressão).
  const recovery = { findActiveInvoiceIds: vi.fn().mockResolvedValue([]) };
  const service = new NotificationSchedulerService({
    accounts: accounts as any,
    invoices: invoices as any,
    notifications: notifications as any,
    regua: regua as any,
    recovery: recovery as any,
  });
  return { service, accounts, invoices, notifications, regua, recovery };
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

  it('régua ligada: envia o passo devido e avança o reminderStep (spec 0026)', async () => {
    const { service, accounts, invoices, notifications, regua } = make();
    const NOW = new Date('2026-08-10T12:00:00Z');
    accounts.findActiveTenantIds.mockResolvedValue(['t1']);
    regua.get.mockResolvedValue({
      enabled: true,
      steps: [
        { offsetDays: 0, message: 'Olá {nome}, vence hoje: {valor}' },
        { offsetDays: 3 },
      ],
    });
    invoices.findReguaCandidates.mockResolvedValue([
      // vencida há 5 dias, nenhum passo enviado → deve enviar o passo 1 (offset 0)
      { id: 'a', status: 'OVERDUE', value: 100, dueDate: new Date('2026-08-05T12:00:00Z'), reminderStep: 0, clientId: 'c', clientName: 'Ana', phone: '5511999999999', document: '1' },
      // vence só daqui a 2 dias → passo 1 (offset 0) ainda não é devido
      { id: 'b', status: 'PENDING', value: 50, dueDate: new Date('2026-08-12T12:00:00Z'), reminderStep: 0, clientId: 'd', clientName: 'Beto', phone: '5511888888888', document: '2' },
    ]);
    notifications.queueOverdueInvoices.mockResolvedValue({ enqueued: 1 });

    const result = await service.runAllTenants(NOW);

    expect(result.enfileirados).toBe(1);
    expect(invoices.markReminderStep).toHaveBeenCalledWith('a', 1);
    expect(invoices.markReminderStep).not.toHaveBeenCalledWith('b', expect.anything());
    // a mensagem do passo veio parametrizada
    const dto = notifications.queueOverdueInvoices.mock.calls[0][0][0];
    expect(dto).toMatchObject({ id: 'a', step: 1 });
    expect(dto.message).toBe('Olá Ana, vence hoje: R$ 100.00');
  });
});
