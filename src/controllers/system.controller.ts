import { Request, Response } from 'express';
import { BillingSchedulerService } from '../services/billing-scheduler.service.js';

export class SystemController {
  private scheduler: BillingSchedulerService;

  constructor() {
    this.scheduler = new BillingSchedulerService();
  }

  /**
   * Dispara a cobrança recorrente de TODOS os tenants (spec 0010).
   * Faz o fan-out para a fila e responde 202 na hora — o worker gera as
   * faturas em segundo plano, um tenant por vez.
   */
  async runBilling(_req: Request, res: Response) {
    try {
      const result = await this.scheduler.enqueueAllTenants();
      return res.status(202).json({
        message: 'Cobrança recorrente enfileirada para processamento.',
        ...result,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
