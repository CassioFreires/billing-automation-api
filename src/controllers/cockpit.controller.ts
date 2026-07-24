import { Request, Response } from 'express';
import { CockpitService } from '../services/cockpit.service.js';
import { ActionQueueService } from '../services/action-queue.service.js';

export class CockpitController {
  private service: CockpitService;
  private actionQueue: ActionQueueService;

  constructor() {
    this.service = new CockpitService();
    this.actionQueue = new ActionQueueService();
  }

  overview = async (req: Request, res: Response) => {
    try {
      const raw = req.query.days;
      const days = raw === undefined ? 30 : Number(raw);

      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return res
          .status(400)
          .json({ error: 'days deve ser um inteiro entre 1 e 365' });
      }

      const result = await this.service.getOverview(days);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };

  /** Lista do Dia (spec 0036, F3): fila de ação priorizada por dinheiro em risco. */
  actions = async (_req: Request, res: Response) => {
    try {
      const result = await this.actionQueue.getForTenant();
      return res.status(200).json(result);
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };
}
