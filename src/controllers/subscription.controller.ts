import { Request, Response } from 'express';
import { SubscriptionService } from '../services/subscription.service.js';
import {
  validateCreateSubscription,
  validateUpdateSubscription,
} from '../dtos/subscription.dto.js';

export class SubscriptionController {
  private service: SubscriptionService;

  constructor() {
    this.service = new SubscriptionService();
  }

  async create(req: Request, res: Response) {
    try {
      const data = validateCreateSubscription(req.body);
      const sub = await this.service.create(data);
      return res.status(201).json(sub);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async findAll(req: Request, res: Response) {
    try {
      const subs = await this.service.findAll();
      return res.json(subs);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const sub = await this.service.findById(String(req.params.id));
      return res.json(sub);
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const data = validateUpdateSubscription(req.body);
      const sub = await this.service.update(String(req.params.id), data);
      return res.json(sub);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.service.delete(String(req.params.id));
      return res.status(204).send();
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }

  /** Geração recorrente — chamado pelo agendador (n8n). Escopo = tenant do token. */
  async run(req: Request, res: Response) {
    try {
      const result = await this.service.run();
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
