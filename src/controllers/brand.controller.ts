import { Request, Response } from 'express';
import { z } from 'zod';
import { BrandService } from '../services/brand.service.js';
import { BrandValidationError } from '../domain/brand.js';

const brandSchema = z.object({ brandColor: z.string().min(3).max(9) });

/** White-label (spec 0050) — cor de marca do dono (JWT). */
export class BrandController {
  private service: BrandService;
  constructor() {
    this.service = new BrandService();
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
      const dto = brandSchema.parse(req.body);
      return res.status(200).json(await this.service.updateSettings(dto.brandColor));
    } catch (e: any) {
      if (e?.name === 'ZodError') return res.status(400).json({ error: 'Cor inválida.' });
      if (e instanceof BrandValidationError) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };
}
