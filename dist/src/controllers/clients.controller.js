import { ClientService } from '../services/clients.service.js';
import { validateCreateClient } from '../dtos/createClient.dto.js';
import { validateUpdateClient } from '../dtos/updateClient.dto.js';
export class ClientController {
    service;
    constructor() {
        this.service = new ClientService();
    }
    async create(req, res) {
        try {
            const data = validateCreateClient(req.body);
            const client = await this.service.create(data);
            return res.status(201).json(client);
        }
        catch (error) {
            return res.status(400).json({
                error: error.message
            });
        }
    }
    async findAll(req, res) {
        try {
            const clients = await this.service.findAll();
            return res.json(clients);
        }
        catch (error) {
            return res.status(500).json({
                error: error.message
            });
        }
    }
    async findById(req, res) {
        try {
            const client = await this.service.findById(String(req.params.id));
            return res.json(client);
        }
        catch (error) {
            return res.status(404).json({
                error: error.message
            });
        }
    }
    async update(req, res) {
        try {
            const data = validateUpdateClient(req.body);
            const client = await this.service.update(String(req.params.id), data);
            return res.json(client);
        }
        catch (error) {
            return res.status(400).json({
                error: error.message
            });
        }
    }
    async delete(req, res) {
        try {
            await this.service.delete(String(req.params.id));
            return res.status(204).send();
        }
        catch (error) {
            return res.status(404).json({
                error: error.message
            });
        }
    }
}
