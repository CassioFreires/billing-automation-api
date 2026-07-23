import { AccountRepository } from '../repositories/account.repository.js';
import { RecoveryCaseRepository } from '../repositories/recovery-case.repository.js';
import { InteractionEventRepository } from '../repositories/interaction-event.repository.js';
import { NotificationService } from './notication.service.js';
import { ChannelSettingService } from './channel-setting.service.js';
import { NegotiationSettingService } from './negotiation-setting.service.js';
import { runWithTenant, requireTenantId } from '../context/tenant-context.js';
import { resolveChannels, type DeliveryChannel } from '../domain/channels.js';
import {
  decideNextStep,
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_INTERVAL_DAYS,
} from '../domain/recovery.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

export interface RecoveryRunResult {
  tenants: number; // tenants ativos avaliados
  opened: number; // casos abertos (faturas que viraram devidas)
  advanced: number; // casos que avançaram um passo (envio enfileirado)
  lost: number; // casos encerrados como perdidos (esgotados)
}

/**
 * Motor de recuperação de pagamento falho (spec 0033 — F1). Uma vez por dia, varre
 * TODOS os tenants ativos e, por tenant: (a) ABRE casos para faturas vencidas sem
 * caso; (b) AVANÇA os casos devidos decidindo o passo (`decideNextStep`) e
 * enfileirando o envio na fila de faturas — reaproveitando o invoice worker.
 *
 * Implementação inline (padrão do NotificationSchedulerService, spec 0013): só há
 * queries + publish leves; o envio pesado já é assíncrono no worker.
 *
 * Fechamento (recovered) NÃO acontece aqui — vem do webhook de pagamento e do
 * aceite de acordo, via `closeCase()` (RN-3306).
 */
export class RecoveryService {
  private accounts: AccountRepository;
  private recovery: RecoveryCaseRepository;
  private events: InteractionEventRepository;
  private notifications: NotificationService;
  private channels: ChannelSettingService;
  private negotiation: NegotiationSettingService;

  constructor(deps?: {
    accounts?: AccountRepository;
    recovery?: RecoveryCaseRepository;
    events?: InteractionEventRepository;
    notifications?: NotificationService;
    channels?: ChannelSettingService;
    negotiation?: NegotiationSettingService;
  }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.recovery = deps?.recovery ?? new RecoveryCaseRepository();
    this.events = deps?.events ?? new InteractionEventRepository();
    this.notifications = deps?.notifications ?? new NotificationService();
    this.channels = deps?.channels ?? new ChannelSettingService();
    this.negotiation = deps?.negotiation ?? new NegotiationSettingService();
  }

  /** Varre todos os tenants ativos. `now` é injetável para teste. */
  async runAllTenants(now: Date = new Date()): Promise<RecoveryRunResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();
    let opened = 0;
    let advanced = 0;
    let lost = 0;

    for (const tenantId of tenantIds) {
      const res = await runWithTenant(tenantId, () => this.sweepTenant(now));
      opened += res.opened;
      advanced += res.advanced;
      lost += res.lost;
    }

    return { tenants: tenantIds.length, opened, advanced, lost };
  }

  private async sweepTenant(now: Date): Promise<{ opened: number; advanced: number; lost: number }> {
    const opened = await this.openDueCases(now);
    const { advanced, lost } = await this.advanceDueCases(now);
    return { opened, advanced, lost };
  }

  /** Abre casos para faturas vencidas sem caso (RN-3301). */
  private async openDueCases(now: Date): Promise<number> {
    const tenantId = requireTenantId();
    const overdue = await this.recovery.findOverdueWithoutCase(now);
    for (const inv of overdue) {
      await this.recovery.openCase({
        invoiceId: inv.id,
        clientId: inv.clientId,
        subscriptionId: inv.subscriptionId,
        amountAtRisk: inv.value,
        nextActionAt: now, // devido já nesta execução
        tenantId,
      });
    }
    return overdue.length;
  }

  /** Avança os casos devidos: decide o passo e enfileira o envio (RN-3303/3304). */
  private async advanceDueCases(now: Date): Promise<{ advanced: number; lost: number }> {
    const tenantId = requireTenantId();
    const cases = await this.recovery.findDueCases(now);
    if (cases.length === 0) return { advanced: 0, lost: 0 };

    const { channel: preferred } = await this.channels.get();
    const rules = await this.negotiation.getRules();

    let advanced = 0;
    let lost = 0;

    for (const c of cases) {
      const counts = await this.events.countsByInvoice(c.invoice.id);
      const opens = counts['open'] ?? 0;
      const hadPayAttempt = (counts['pay_attempt'] ?? 0) > 0;
      const channels = resolveChannels(preferred, { hasEmail: c.invoice.hasEmail });

      const decision = decideNextStep({
        currentStep: c.currentStep,
        maxSteps: DEFAULT_MAX_STEPS,
        lastChannel: (c.lastChannel as DeliveryChannel | null) ?? null,
        channels,
        // lastSendFailed=false: o envio é assíncrono (worker); feedback de entrega
        // depende do webhook de status (D-02). Domínio já suporta; enforcado no futuro.
        signals: { opens, hadPayAttempt, lastSendFailed: false },
        relief: {
          enabled: rules.enabled,
          hesitationOpens: rules.hesitationOpens,
          alreadyOffered: c.reliefOffered,
        },
      });

      if (decision.action === 'give_up') {
        await this.recovery.markLost(c.id);
        lost += 1;
        continue;
      }

      const isRelief = decision.action === 'offer_relief';
      const dto: TriggerNotificationDTO = {
        id: c.invoice.id,
        status: c.invoice.status,
        document: c.invoice.document,
        phone: c.invoice.phone,
        clientName: c.invoice.clientName,
        value: c.invoice.value,
        // step definido → o worker NÃO mexe em notificationSent (evita conflito com a régua).
        step: decision.nextStep,
        message: buildRecoveryMessage(c.invoice.clientName, c.invoice.value, isRelief),
      };
      await this.notifications.queueOverdueInvoices([dto]);

      await this.recovery.recordAttemptAndAdvance({
        caseId: c.id,
        tenantId,
        step: decision.nextStep,
        channel: decision.channel,
        action: decision.action,
        result: 'sent',
        reliefOffered: c.reliefOffered || isRelief,
        nextActionAt: addDays(now, DEFAULT_STEP_INTERVAL_DAYS),
      });
      advanced += 1;
    }

    return { advanced, lost };
  }

  /**
   * Fecha o caso de uma fatura (RN-3306). Chamado pelo webhook de pagamento (PAID)
   * e pelo aceite de acordo. Idempotente e cross-tenant safe.
   */
  async closeCase(invoiceId: string, outcome: 'paid' | 'agreement'): Promise<{ closed: boolean }> {
    return this.recovery.closeByInvoiceId(invoiceId, outcome);
  }
}

/** Mensagem do passo: o worker anexa o link (Elo → /pagar, onde o alívio aparece). */
function buildRecoveryMessage(nome: string, value: number, relief: boolean): string {
  const valor = `R$ ${value.toFixed(2)}`;
  return relief
    ? `Olá ${nome}, podemos facilitar o pagamento da sua cobrança de ${valor}: dá para parcelar ou adiar. Acesse:`
    : `Olá ${nome}, sua cobrança de ${valor} está em aberto. Você pode pagar pelo link:`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
