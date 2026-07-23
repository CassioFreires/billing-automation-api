import { describe, it, expect, vi } from 'vitest';
import {
  PaymentService,
  NotFoundError,
  ConflictError,
} from '../../src/services/payment.service.js';

function makeService() {
  const invoices = { findById: vi.fn(), settleManually: vi.fn() };
  const payments = { findByInvoice: vi.fn() };
  // Recuperação (spec 0033): mock hermético — baixa manual fecha o caso, se houver.
  const recovery = { closeByInvoiceId: vi.fn().mockResolvedValue({ closed: false }) };
  const service = new PaymentService({ invoices: invoices as any, payments: payments as any, recovery: recovery as any });
  return { service, invoices, payments, recovery };
}

describe('PaymentService.registerManual (baixa manual)', () => {
  it('registra o pagamento e quita a fatura PENDING (default amount = valor da fatura)', async () => {
    const { service, invoices } = makeService();
    invoices.findById.mockResolvedValue({ id: 'inv1', status: 'PENDING', value: 100 });
    invoices.settleManually.mockResolvedValue({
      payment: { id: 'pay1' },
      invoice: { id: 'inv1', status: 'PAID' },
    });

    const result = await service.registerManual('inv1', { method: 'dinheiro' } as any);

    const arg = invoices.settleManually.mock.calls[0][0];
    expect(arg.invoiceId).toBe('inv1');
    expect(arg.method).toBe('dinheiro');
    expect(arg.amount).toBe(100); // default = valor da fatura
    expect(arg.paidAt).toBeInstanceOf(Date);
    expect(result.invoice.status).toBe('PAID');
  });

  it('respeita amount e paidAt informados', async () => {
    const { service, invoices } = makeService();
    invoices.findById.mockResolvedValue({ id: 'inv1', status: 'PENDING', value: 100 });
    invoices.settleManually.mockResolvedValue({ payment: {}, invoice: {} });
    const paidAt = new Date('2026-07-01T00:00:00Z');

    await service.registerManual('inv1', { method: 'pix', amount: 42.5, paidAt } as any);

    const arg = invoices.settleManually.mock.calls[0][0];
    expect(arg.amount).toBe(42.5);
    expect(arg.paidAt).toBe(paidAt);
  });

  it('404 (NotFoundError) quando a fatura não existe — não quita', async () => {
    const { service, invoices } = makeService();
    invoices.findById.mockResolvedValue(null);

    await expect(
      service.registerManual('naoexiste', { method: 'pix' } as any)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(invoices.settleManually).not.toHaveBeenCalled();
  });

  it('409 (ConflictError) quando a fatura já está PAID — não quita de novo', async () => {
    const { service, invoices } = makeService();
    invoices.findById.mockResolvedValue({ id: 'inv1', status: 'PAID', value: 100 });

    await expect(
      service.registerManual('inv1', { method: 'pix' } as any)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(invoices.settleManually).not.toHaveBeenCalled();
  });
});

describe('PaymentService.listByInvoice', () => {
  it('lista os pagamentos quando a fatura existe', async () => {
    const { service, invoices, payments } = makeService();
    invoices.findById.mockResolvedValue({ id: 'inv1', status: 'PAID' });
    payments.findByInvoice.mockResolvedValue([{ id: 'pay1' }]);

    const result = await service.listByInvoice('inv1');

    expect(payments.findByInvoice).toHaveBeenCalledWith('inv1');
    expect(result).toEqual([{ id: 'pay1' }]);
  });

  it('404 quando a fatura não existe', async () => {
    const { service, invoices } = makeService();
    invoices.findById.mockResolvedValue(null);
    await expect(service.listByInvoice('x')).rejects.toBeInstanceOf(NotFoundError);
  });
});
