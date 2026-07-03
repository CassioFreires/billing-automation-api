import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { CreateClientDTO } from '../dtos/createClient.dto.js';
import { UpdateClientDTO } from '../dtos/updateClient.dto.js';
import { ImportClientsDTO } from '../dtos/importClients.dto.js';

export class ClientService {
  private repository: ClientRepository;

  constructor() {
    this.repository = new ClientRepository();
  }

  async create(data: CreateClientDTO) {
    const alreadyExists =
      await this.repository.findByPhone(
        data.phone
      );

    if (alreadyExists) {
      throw new Error(
        'Já existe um cliente com este telefone.'
      );
    }

    return this.repository.create(data);
  }

  /**
   * Importa clientes em lote de forma idempotente por telefone (spec 0008).
   * Retorna { criados, atualizados, ignorados }.
   */
  async import(data: ImportClientsDTO) {
    return this.repository.importUpsert(data.clients);
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const client =
      await this.repository.findById(id);

    if (!client) {
      throw new Error('Cliente não encontrado.');
    }

    return client;
  }

  async update(
    id: string,
    data: UpdateClientDTO
  ) {
    await this.findById(id);

    return this.repository.update(
      id,
      data
    );
  }

  async delete(id: string) {
    await this.findById(id);

    return this.repository.delete(id);
  }
}