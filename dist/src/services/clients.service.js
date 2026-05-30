import { ClientRepository } from '../repositories/cliente.repositorie.js';
export class ClientService {
    repository;
    constructor() {
        this.repository = new ClientRepository();
    }
    async create(data) {
        const alreadyExists = await this.repository.findByPhone(data.phone);
        if (alreadyExists) {
            throw new Error('Já existe um cliente com este telefone.');
        }
        return this.repository.create(data);
    }
    async findAll() {
        return this.repository.findAll();
    }
    async findById(id) {
        const client = await this.repository.findById(id);
        if (!client) {
            throw new Error('Cliente não encontrado.');
        }
        return client;
    }
    async update(id, data) {
        await this.findById(id);
        return this.repository.update(id, data);
    }
    async delete(id) {
        await this.findById(id);
        return this.repository.delete(id);
    }
}
