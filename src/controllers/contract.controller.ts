import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ContractService } from '../services/contract.service.js';
import { validateContractSettings } from '../dtos/contract.dto.js';

/** Contrato no Celular (spec 0040) — config do DONO (JWT). */
export class ContractController {
  private service: ContractService;

  constructor() {
    this.service = new ContractService();
  }

  getSettings = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.getSettings());
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const dto = validateContractSettings(req.body);
      return res.status(200).json(await this.service.updateSettings(dto));
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.issues });
      return res.status(500).json({ error: error.message });
    }
  };
}
