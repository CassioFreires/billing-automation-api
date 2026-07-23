import { Request, Response } from 'express';
import { RecoveryService } from '../services/recovery.service.js';

/** API do dono para os casos de recuperação (spec 0033, F1). Somente do próprio tenant. */
export class RecoveryController {
  private service: RecoveryService;

  constructor() {
    this.service = new RecoveryService();
  }

  listCases = async (_req: Request, res: Response) => {
    try {
      const cases = await this.service.listCases();
      return res.status(200).json(cases);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };

  getCase = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const found = await this.service.getCase(id);
      if (!found) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
      return res.status(200).json(found);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };

  closeCase = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.cancelCase(id);
      if (!result.cancelled) return res.status(409).json({ error: 'CASE_NOT_OPEN' });
      return res
        .status(200)
        .json({ id, status: 'cancelled', outcome: 'cancelado_pelo_dono' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };
}
