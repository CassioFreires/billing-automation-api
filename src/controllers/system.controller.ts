import { Request, Response } from 'express';
import { BillingSchedulerService } from '../services/billing-scheduler.service.js';
import { NotificationSchedulerService } from '../services/notification-scheduler.service.js';
import { PlatformSubscriptionService } from '../services/platform-subscription.service.js';
import { RecoveryService } from '../services/recovery.service.js';

export class SystemController {
  private scheduler: BillingSchedulerService;
  private notificationScheduler: NotificationSchedulerService;
  private platform: PlatformSubscriptionService;
  private recovery: RecoveryService;

  constructor() {
    this.scheduler = new BillingSchedulerService();
    this.notificationScheduler = new NotificationSchedulerService();
    this.platform = new PlatformSubscriptionService();
    this.recovery = new RecoveryService();
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

  /**
   * Enfileira as notificações dos vencidos de TODOS os tenants (spec 0013).
   * Chamado pelo cron. O envio (WhatsApp) roda no invoice worker.
   */
  async runNotifications(_req: Request, res: Response) {
    try {
      const result = await this.notificationScheduler.runAllTenants();
      return res.status(202).json({
        message: 'Notificações de vencidos enfileiradas.',
        ...result,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Varredura da cobrança do SaaS (spec 0020): expira trials vencidos e marca
   * assinaturas pagas com período vencido como inadimplentes. Chamado pelo cron.
   */
  async runPlatformBilling(_req: Request, res: Response) {
    try {
      const result = await this.platform.runRenewals();
      return res.status(200).json({ message: 'Varredura de assinaturas concluída.', ...result });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Sweep de recuperação de pagamento falho (spec 0033, F1): abre casos para
   * vencidos e avança os devidos, enfileirando o envio no invoice worker.
   * Chamado pelo cron. Responde 202 (o envio é assíncrono).
   */
  async runRecovery(_req: Request, res: Response) {
    try {
      const result = await this.recovery.runAllTenants();
      return res.status(202).json({ message: 'Recuperação de pagamentos processada.', ...result });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
