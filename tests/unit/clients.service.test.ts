import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByPhone: vi.fn(),
  create: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  importUpsert: vi.fn(),
}));

vi.mock('../../src/repositories/cliente.repositorie.js', () => ({
  ClientRepository: class {
    findByPhone = mocks.findByPhone;
    create = mocks.create;
    findAll = mocks.findAll;
    findById = mocks.findById;
    update = mocks.update;
    delete = mocks.del;
    importUpsert = mocks.importUpsert;
  },
}));

const { ClientService } = await import('../../src/services/clients.service.js');

describe('ClientService', () => {
  let service: InstanceType<typeof ClientService>;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    service = new ClientService();
  });

  it('create: lança quando o telefone já existe (RN-C1)', async () => {
    mocks.findByPhone.mockResolvedValue({ id: '1' });

    await expect(
      service.create({ name: 'Ana', phone: '11999999999', document: '12345678901' } as any)
    ).rejects.toThrow('Já existe um cliente com este telefone.');

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('create: cria quando o telefone é novo', async () => {
    mocks.findByPhone.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: '1', name: 'Ana' });

    const result = await service.create({
      name: 'Ana',
      phone: '11999999999',
      document: '12345678901',
    } as any);

    expect(result).toEqual({ id: '1', name: 'Ana' });
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('findById: lança quando não encontrado', async () => {
    mocks.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toThrow('Cliente não encontrado.');
  });

  it('update: valida existência antes de atualizar', async () => {
    mocks.findById.mockResolvedValue({ id: '1' });
    mocks.update.mockResolvedValue({ id: '1', name: 'Novo' });

    const result = await service.update('1', { name: 'Novo' } as any);

    expect(mocks.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({ id: '1', name: 'Novo' });
  });

  it('delete: não deleta quando não encontrado', async () => {
    mocks.findById.mockResolvedValue(null);
    await expect(service.delete('x')).rejects.toThrow('Cliente não encontrado.');
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('import: delega o lote para o repositório (spec 0008)', async () => {
    mocks.importUpsert.mockResolvedValue({ criados: 2, atualizados: 1, ignorados: 0 });

    const clients = [
      { name: 'Ana', phone: '11999999999', document: '12345678901' },
      { name: 'Bia', phone: '11888888888', document: '98765432100' },
    ];

    const result = await service.import({ clients } as any);

    expect(mocks.importUpsert).toHaveBeenCalledWith(clients);
    expect(result).toEqual({ criados: 2, atualizados: 1, ignorados: 0 });
  });
});
