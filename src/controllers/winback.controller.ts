import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { WinbackService } from '../services/winback.service.js';
import { validateWinbackSettings } from '../dtos/winback.dto.js';

/** Winback / reativação (spec 0045, F5) — config e métrica pelo dono (JWT). */
export class WinbackController {
  private service: WinbackService;

  constructor() {
    this.service = new WinbackService();
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
      const dto = validateWinbackSettings(req.body);
      return res.status(200).json(await this.service.updateSettings(dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: e.message });
    }
  };

  summary = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.summary());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };
}
