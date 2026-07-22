import { describe, it, expect, vi } from 'vitest';
import { InvoiceService } from '../../src/services/invoice.service.js';

/**
 * Testa o importInvoices isolando o createPayment (o fluxo de criação já é
 * coberto por outros testes). Foco: resolução por telefone + best-effort por linha.
 */
function makeService() {
  const clients = { findByPhones: vi.fn() };
  const service = new InvoiceService({ clients: clients as any });
  // Substitui createPayment por um espião — não queremos tocar gateway/repos aqui.
  const createPayment = vi.spyOn(service, 'createPayment').mockResolvedValue({ id: 'inv' } as any);
  return { service, clients, createPayment };
}

const row = (clientPhone: string, value = 100) => ({
  clientPhone,
  value,
  dueDate: new Date('2026-08-01'),
  description: 'Mensalidade',
});

describe('InvoiceService.importInvoices (spec 0024)', () => {
  it('cria faturas para telefones conhecidos e ignora desconhecidos', async () => {
    const { service, clients, createPayment } = makeService();
    clients.findByPhones.mockResolvedValue([
      { id: 'c1', phone: '5511999990000' },
      { id: 'c2', phone: '5511999991111' },
    ]);

    const result = await service.importInvoices([
      row('5511999990000'),
      row('5511000000000'), // desconhecido
      row('5511999991111'),
    ]);

    expect(result.criados).toBe(2);
    expect(result.erros).toHaveLength(1);
    expect(result.ignorados).toBe(1);
    expect(createPayment).toHaveBeenCalledTimes(2);
    // o item leva a descrição e o unitPrice = value
    expect(createPayment.mock.calls[0][0]).toMatchObject({
      clientId: 'c1',
      items: [{ description: 'Mensalidade', quantity: 1, unitPrice: 100 }],
    });
  });

  it('erro numa linha não aborta as demais (best-effort)', async () => {
    const { service, clients, createPayment } = makeService();
    clients.findByPhones.mockResolvedValue([
      { id: 'c1', phone: '5511999990000' },
      { id: 'c2', phone: '5511999991111' },
    ]);
    createPayment
      .mockRejectedValueOnce(new Error('gateway caiu'))
      .mockResolvedValueOnce({ id: 'inv2' } as any);

    const result = await service.importInvoices([row('5511999990000'), row('5511999991111')]);

    expect(result.criados).toBe(1);
    expect(result.erros).toHaveLength(1);
    expect(result.erros[0].motivo).toContain('gateway caiu');
  });
});
