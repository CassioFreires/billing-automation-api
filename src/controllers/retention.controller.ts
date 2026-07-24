import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { RetentionService, NotFoundError, ConflictError } from '../services/retention.service.js';
import { validateOpenCancellation, validateResolveCancellation } from '../dtos/retention.dto.js';

export class RetentionController {
  private service: RetentionService;

  constructor() {
    this.service = new RetentionService();
  }

  /** Abre o fluxo de retenção e devolve a oferta recomendada. */
  open = async (req: Request, res: Response) => {
    try {
      const dto = validateOpenCancellation(req.body);
      const result = await this.service.openRequest(dto.subscriptionId, dto.reason ?? null);
      return res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.issues });
      if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  };

  /** Resolve: salvo (aplica oferta) ou cancelado. */
  resolve = async (req: Request, res: Response) => {
    try {
      const dto = validateResolveCancellation(req.body);
      const result = await this.service.resolveRequest(String(req.params.id), dto.outcome, dto.offer);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.issues });
      if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
      if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  };

  /** Lista os pedidos (painel de retenção). */
  list = async (_req: Request, res: Response) => {
    try {
      const result = await this.service.listRequests();
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };
}
