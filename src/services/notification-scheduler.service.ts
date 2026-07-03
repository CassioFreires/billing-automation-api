import { AccountRepository } from '../repositories/account.repository.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { NotificationService } from './notication.service.js';
import { runWithTenant } from '../context/tenant-context.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

export interface NotificationRunResult {
  tenants: number;      // tenants ativos avaliados
  comVencidos: number;  // tenants que tinham vencidos
  enfileirados: number; // total de notificações enfileiradas
}

/**
 * Agendador de notificações cross-tenant (spec 0013) — o par do agendador de
 * cobrança. Uma vez por dia, varre TODOS os tenants ativos e enfileira as
 * notificações dos vencidos de cada um na fila de faturas (INVOICE_QUEUE), que
 * o worker já consome enviando o WhatsApp. Reaproveita a fila/worker existentes.
 *
 * Implementação inline (sem fila própria): o trabalho pesado (envio) já é
 * assíncrono no invoice worker; aqui só há queries + publish, que são leves.
 */
export class NotificationSchedulerService {
  private accounts: AccountRepository;
  private invoices: InvoiceRepository;
  private notifications: NotificationService;

  constructor(deps?: {
    accounts?: AccountRepository;
    invoices?: InvoiceRepository;
    notifications?: NotificationService;
  }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.notifications = deps?.notifications ?? new NotificationService();
  }

  /** Enfileira as notificações dos vencidos de todos os tenants ativos. */
  async runAllTenants(): Promise<NotificationRunResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();

    let comVencidos = 0;
    let enfileirados = 0;

    for (const tenantId of tenantIds) {
      const count = await runWithTenant(tenantId, async () => {
        // Busca os vencidos do tenant (PENDING de clientes EM_ATRASO).
        const page = await this.invoices.findPendingInvoices(1, 500);
        const invoices = page.invoices as Array<{
          id: string;
          status: string;
          value: number;
          client: { name: string; phone: string; document: string };
        }>;

        if (invoices.length === 0) return 0;

        const dtos: TriggerNotificationDTO[] = invoices.map((inv) => ({
          id: inv.id,
          status: inv.status,
          document: inv.client.document,
          phone: inv.client.phone,
          clientName: inv.client.name,
          value: inv.value,
        }));

        const { enqueued } = await this.notifications.queueOverdueInvoices(dtos);
        return enqueued;
      });

      if (count > 0) {
        comVencidos++;
        enfileirados += count;
      }
    }

    return { tenants: tenantIds.length, comVencidos, enfileirados };
  }
}
