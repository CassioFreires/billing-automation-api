import { AccountRepository } from '../repositories/account.repository.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { NotificationService } from './notication.service.js';
import { ReguaSettingService } from './regua-setting.service.js';
import { runWithTenant } from '../context/tenant-context.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import { selectDueStep, daysFromDue, applyTemplate } from '../domain/regua.js';

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
  private regua: ReguaSettingService;

  constructor(deps?: {
    accounts?: AccountRepository;
    invoices?: InvoiceRepository;
    notifications?: NotificationService;
    regua?: ReguaSettingService;
  }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.notifications = deps?.notifications ?? new NotificationService();
    this.regua = deps?.regua ?? new ReguaSettingService();
  }

  /**
   * Varre todos os tenants ativos. Se a régua (spec 0026) estiver ligada, envia
   * o PRÓXIMO passo devido de cada fatura em aberto; senão, cai no comportamento
   * legado (enfileira os vencidos como antes). `now` é injetável para teste.
   */
  async runAllTenants(now: Date = new Date()): Promise<NotificationRunResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();

    let comVencidos = 0;
    let enfileirados = 0;

    for (const tenantId of tenantIds) {
      const count = await runWithTenant(tenantId, async () => {
        const regua = await this.regua.get();
        return regua.enabled && regua.steps.length > 0
          ? this.runReguaForTenant(regua.steps, now)
          : this.runLegacyForTenant();
      });

      if (count > 0) {
        comVencidos++;
        enfileirados += count;
      }
    }

    return { tenants: tenantIds.length, comVencidos, enfileirados };
  }

  /** Régua ligada: um passo devido por fatura, por execução (RN-2603). */
  private async runReguaForTenant(
    steps: { offsetDays: number; message?: string }[],
    now: Date
  ): Promise<number> {
    const candidates = await this.invoices.findReguaCandidates(500);
    if (candidates.length === 0) return 0;

    const offsets = steps.map((s) => s.offsetDays);
    let enqueued = 0;

    for (const inv of candidates) {
      const dias = daysFromDue(now, inv.dueDate);
      const step = selectDueStep(offsets, dias, inv.reminderStep);
      if (step === null) continue;

      const raw = steps[step - 1]?.message;
      const message = raw
        ? applyTemplate(raw, { nome: inv.clientName, valor: inv.value })
        : undefined;

      const dto: TriggerNotificationDTO = {
        id: inv.id,
        status: inv.status,
        document: inv.document,
        phone: inv.phone,
        clientName: inv.clientName,
        value: inv.value,
        step,
        message,
      };

      await this.notifications.queueOverdueInvoices([dto]);
      // Avança o passo já no enfileiramento (idempotência por passo — RN-2607).
      await this.invoices.markReminderStep(inv.id, step);
      enqueued += 1;
    }

    return enqueued;
  }

  /** Comportamento legado (régua desligada): enfileira os vencidos do tenant. */
  private async runLegacyForTenant(): Promise<number> {
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
      value: Number(inv.value),
    }));

    const { enqueued } = await this.notifications.queueOverdueInvoices(dtos);
    return enqueued;
  }
}
