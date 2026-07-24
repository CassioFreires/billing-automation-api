import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AccessService, NotFoundError, BadRequestError } from '../services/access.service.js';
import { validateAccessSettings, validateAccessOverride } from '../dtos/access.dto.js';

/** Liga/Desliga o Acesso (spec 0042, F12) — dono (JWT). */
export class AccessController {
  private service: AccessService;

  constructor() {
    this.service = new AccessService();
  }

  getSettings = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.getSettings());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const dto = validateAccessSettings(req.body);
      return res.status(200).json(await this.service.updateSettings(dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: e.message });
    }
  };

  listClients = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.listClientsAccess());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  setOverride = async (req: Request, res: Response) => {
    try {
      const dto = validateAccessOverride(req.body);
      return res.status(200).json(await this.service.setOverride(String(req.params.id), dto.override));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      if (e instanceof BadRequestError) return res.status(400).json({ error: e.message });
      if (e instanceof NotFoundError) return res.status(404).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };
}
