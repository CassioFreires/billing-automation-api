import { describe, it, expect, vi } from 'vitest';
import { SubscriptionService } from '../../src/services/subscription.service.js';

function makeService() {
  const repository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findDueActive: vi.fn(),
    setNextRun: vi.fn(),
  };
  const invoiceService = { createForSubscription: vi.fn() };

  const service = new SubscriptionService({
    repository: repository as any,
    invoiceService: invoiceService as any,
  });

  return { service, repository, invoiceService };
}

describe('SubscriptionService.create', () => {
  it('calcula o primeiro vencimento no dayOfMonth do mês corrente se ainda não passou', async () => {
    const { service, repository } = makeService();
    repository.create.mockResolvedValue({ id: 's1' });

    await service.create({
      clientId: 'c1',
      description: 'Plano Pro',
      amount: 99.9,
      dayOfMonth: 20,
      startDate: new Date('2026-07-05T00:00:00Z'),
    } as any);

    const arg = repository.create.mock.calls[0][0];
    expect(arg.nextRunDate.toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  it('joga o primeiro vencimento para o mês seguinte se o dia já passou', async () => {
    const { service, repository } = makeService();
    repository.create.mockResolvedValue({ id: 's1' });

    await service.create({
      clientId: 'c1',
      description: 'Plano Pro',
      amount: 99.9,
      dayOfMonth: 3,
      startDate: new Date('2026-07-25T00:00:00Z'),
    } as any);

    const arg = repository.create.mock.calls[0][0];
    expect(arg.nextRunDate.toISOString().slice(0, 10)).toBe('2026-08-03');
  });
});

describe('SubscriptionService.findById', () => {
  it('lança quando não encontrada', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toThrow('Assinatura não encontrada.');
  });
});

describe('SubscriptionService.run (geração recorrente)', () => {
  it('gera fatura para assinatura vencida e avança o próximo vencimento', async () => {
    const { service, repository, invoiceService } = makeService();
    repository.findDueActive.mockResolvedValue([
      {
        id: 's1',
        clientId: 'c1',
        description: 'Mensalidade',
        amount: 100,
        dayOfMonth: 10,
        nextRunDate: new Date('2026-07-10T00:00:00Z'),
      },
    ]);
    invoiceService.createForSubscription.mockResolvedValue({ created: true, invoice: { id: 'inv1' } });

    const result = await service.run(new Date('2026-07-11T00:00:00Z'));

    expect(invoiceService.createForSubscription).toHaveBeenCalledOnce();
    const arg = invoiceService.createForSubscription.mock.calls[0][0];
    expect(arg.subscriptionId).toBe('s1');
    expect(arg.period).toBe('2026-07');
    expect(result).toEqual({ processadas: 1, geradas: 1, ignoradas: 0 });

    // avançou para 2026-08-10
    const nextArg = repository.setNextRun.mock.calls[0];
    expect(nextArg[0]).toBe('s1');
    expect(nextArg[1].toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('conta como ignorada quando a fatura da competência já existe (idempotência)', async () => {
    const { service, repository, invoiceService } = makeService();
    repository.findDueActive.mockResolvedValue([
      {
        id: 's1',
        clientId: 'c1',
        description: 'Mensalidade',
        amount: 100,
        dayOfMonth: 10,
        nextRunDate: new Date('2026-07-10T00:00:00Z'),
      },
    ]);
    invoiceService.createForSubscription.mockResolvedValue({ created: false, invoice: { id: 'inv1' } });

    const result = await service.run(new Date('2026-07-11T00:00:00Z'));

    expect(result).toEqual({ processadas: 1, geradas: 0, ignoradas: 1 });
    expect(repository.setNextRun).toHaveBeenCalledOnce(); // ainda avança
  });

  it('sem assinaturas vencidas, não gera nada', async () => {
    const { service, repository, invoiceService } = makeService();
    repository.findDueActive.mockResolvedValue([]);

    const result = await service.run(new Date('2026-07-11T00:00:00Z'));

    expect(result).toEqual({ processadas: 0, geradas: 0, ignoradas: 0 });
    expect(invoiceService.createForSubscription).not.toHaveBeenCalled();
  });
});
