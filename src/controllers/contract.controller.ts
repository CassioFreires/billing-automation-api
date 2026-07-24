import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ContractService, BadRequestError } from '../services/contract.service.js';
import { requireTenantId } from '../context/tenant-context.js';
import { validateContractSettings } from '../dtos/contract.dto.js';

/** Contrato no Celular (spec 0040/0041) — config do DONO (JWT). */
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
      if (error instanceof BadRequestError) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  };

  /** Upload do PDF (corpo binário, Content-Type application/pdf). `?name=` = nome do arquivo. */
  uploadFile = async (req: Request, res: Response) => {
    try {
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return res.status(400).json({ error: 'Envie o PDF no corpo (Content-Type application/pdf).' });
      }
      const name = typeof req.query.name === 'string' ? req.query.name : 'contrato.pdf';
      const result = await this.service.setFile(name, 'application/pdf', buffer);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof BadRequestError) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  };

  /** Preview do PDF pelo dono (JWT). */
  getFile = async (_req: Request, res: Response) => {
    try {
      const f = await this.service.getFile(requireTenantId());
      if (!f) return res.status(404).json({ error: 'Sem arquivo de contrato.' });
      res.setHeader('Content-Type', f.fileMime);
      res.setHeader('Content-Disposition', `inline; filename="${f.fileName}"`);
      return res.send(f.data);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };
}
