import { ClientService } from '../services/clients.service.js';
import { Request, Response } from 'express';

import {
  validateCreateClient
} from '../dtos/createClient.dto.js';

import {
  validateUpdateClient
} from '../dtos/updateClient.dto.js';

export class ClientController {
  private service: ClientService;

  constructor() {
    this.service = new ClientService();
  }

  async create(
    req: Request,
    res: Response
  ) {
    try {
      const data =
        validateCreateClient(req.body);

      const client =
        await this.service.create(data);

      return res.status(201).json(client);
    } catch (error: any) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  async findAll(
    req: Request,
    res: Response
  ) {
    try {
      const clients =
        await this.service.findAll();

      return res.json(clients);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }

  async findById(
    req: Request,
    res: Response
  ) {
    try {
      const client =
        await this.service.findById(String(req.params.id));

      return res.json(client);
    } catch (error: any) {
      return res.status(404).json({
        error: error.message
      });
    }
  }

  async update(
    req: Request,
    res: Response
  ) {
    try {
      const data =
        validateUpdateClient(req.body);

      const client =
        await this.service.update(String(req.params.id),data);

      return res.json(client);
    } catch (error: any) {
      return res.status(400).json({
        error: error.message
      });
    }
  }

  async delete(
    req: Request,
    res: Response
  ) {
    try {
      await this.service.delete(
        String(req.params.id)
      );

      return res.status(204).send();
    } catch (error: any) {
      return res.status(404).json({
        error: error.message
      });
    }
  }
}