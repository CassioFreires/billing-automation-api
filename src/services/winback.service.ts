import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AccountRepository } from '../repositories/account.repository.js';
import { WinbackRepository } from '../repositories/winback.repository.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { PaymentSettingService } from './payment-setting.service.js';
import { NotificationService } from './notication.service.js';
import { PaymentGatewayProvider, resolvePaymentGatewayForTenant } from '../apis/payment/index.js';
import { runWithTenant } from '../context/tenant-context.js';
import { isUniqueViolation } from '../utils/prisma-errors.js';
import {
  isDueForWinback, winbackChargeValue, buildWinbackMessage,
  clampWinbackDays, clampWinbackDiscount,
} from '../domain/winback.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

const DAY_MS = 86_400_000;

export interface WinbackRunResult {
  tenants: number;
  enrolled: number; // novos casos inscritos (assinaturas canceladas)
  sent: number;     // ofertas de retorno enviadas (cobrança + mensagem)
  skipped: number;  // casos pulados (sem telefone, valor zero)
}

/**
 * Winback / reativação (spec 0045 — F5). Uma vez por dia, por tenant: (a) INSCREVE
 * assinaturas canceladas ainda sem caso; (b) DISPARA a oferta de retorno para os
 * casos cuja janela (`daysAfter`) já venceu — gera uma cobrança com desconto (link
 * do Elo) e enfileira a mensagem no invoice worker. "Reativado" = a cobrança de
 * retorno foi paga (métrica no summary). Reusa o padrão do RecoveryService (0033).
 */
export class WinbackService {
  private accounts: AccountRepository;
  private repo: WinbackRepository;
  private invoices: InvoiceRepository;
  private paymentSettings: PaymentSettingService;
  private notifications: NotificationService;
  private injectedGateway?: PaymentGatewayProvider;

  constructor(deps?: {
    accounts?: AccountRepository;
    repo?: WinbackRepository;
    invoices?: InvoiceRepository;
    paymentSettings?: PaymentSettingService;
    notifications?: NotificationService;
    gateway?: PaymentGatewayProvider;
  }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.repo = deps?.repo ?? new WinbackRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.paymentSettings = deps?.paymentSettings ?? new PaymentSettingService();
    this.notifications = deps?.notifications ?? new NotificationService();
    this.injectedGateway = deps?.gateway;
  }

  private async gatewayForTenant(): Promise<PaymentGatewayProvider> {
    if (this.injectedGateway) return this.injectedGateway;
    const config = await this.paymentSettings.getForCurrentTenant();
    return resolvePaymentGatewayForTenant(config);
  }

  // --- Dono (JWT) ---
  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: { enabled?: boolean; daysAfter?: number; discountPercent?: number; message?: string | null }) {
    const clean = {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.daysAfter !== undefined ? { daysAfter: clampWinbackDays(data.daysAfter) } : {}),
      ...(data.discountPercent !== undefined ? { discountPercent: clampWinbackDiscount(data.discountPercent) } : {}),
      ...(data.message !== undefined ? { message: data.message?.trim() || null } : {}),
    };
    return this.repo.upsertSettings(clean);
  }

  async summary() {
    return this.repo.summary();
  }

  // --- Sweep (cron) ---
  async runAllTenants(now: Date = new Date()): Promise<WinbackRunResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();
    const total: WinbackRunResult = { tenants: tenantIds.length, enrolled: 0, sent: 0, skipped: 0 };
    for (const tenantId of tenantIds) {
      // Isolamento por tenant (spec 0054): o erro de um tenant NÃO derruba a varredura
      // dos demais (senão o tenant #3 tira a cobrança dos tenants #4..N naquele dia).
      try {
        const r = await runWithTenant(tenantId, () => this.sweepTenant(now));
        total.enrolled += r.enrolled;
        total.sent += r.sent;
        total.skipped += r.skipped;
      } catch (err) {
        console.error(`⚠️ Winback: sweep do tenant ${tenantId} falhou (segue):`, err);
      }
    }
    return total;
  }

  private async sweepTenant(now: Date): Promise<{ enrolled: number; sent: number; skipped: number }> {
    const settings = await this.repo.getSettings();
    if (!settings.enabled) return { enrolled: 0, sent: 0, skipped: 0 };

    // (a) Inscreve assinaturas canceladas ainda sem caso — o relógio começa agora.
    // Guarda contra corrida: dois sweeps concorrentes veem a mesma sub → o 2º cai no
    // unique de `subscriptionId` e é ignorado (não derruba o sweep).
    const canceled = await this.repo.findCanceledSubsWithoutCase();
    let enrolled = 0;
    for (const sub of canceled) {
      try {
        await this.repo.createCase({ subscriptionId: sub.id, clientId: sub.clientId, eligibleAt: now });
        enrolled++;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }

    // (b) Dispara os casos cuja janela venceu.
    const cutoff = new Date(now.getTime() - settings.daysAfter * DAY_MS);
    const due = (await this.repo.findDueCases(cutoff)).filter((c) =>
      isDueForWinback(c.eligibleAt, settings.daysAfter, now),
    );

    let sent = 0;
    let skipped = 0;
    for (const c of due) {
      const phone = c.client?.phone ?? '';
      const value = winbackChargeValue(Number(c.subscription.amount), settings.discountPercent);
      if (!phone || value <= 0) {
        await this.repo.markSkipped(c.id);
        skipped++;
        continue;
      }

      // CLAIM atômico antes de cobrar (spec 0054): só quem vence gera a cobrança —
      // elimina a cobrança dupla ao cliente cancelado por sweeps concorrentes/replay.
      const claimed = await this.repo.claimForSending(c.id);
      if (!claimed) continue; // outro run já pegou este caso

      const description = `Volta ${c.subscription.description}`;
      const decimal = new Prisma.Decimal(value);

      // Fase 1: reservar fatura + criar cobrança. Se falhar aqui, a cobrança NÃO
      // existe → limpa a reserva e devolve o caso a pending (retry amanhã).
      let reserved: { id: string };
      let charge;
      try {
        reserved = await this.invoices.create({
          clientId: c.clientId,
          value: decimal,
          dueDate: now,
          items: [{ description, quantity: 1, unitPrice: decimal }],
        });
        const gateway = await this.gatewayForTenant();
        charge = await gateway.createCharge({ reference: randomUUID(), amount: value, dueDate: now, description });
      } catch (err) {
        console.error('⚠️ Winback: falha ao criar cobrança (retry amanhã):', err);
        await this.repo.revertToPending(c.id).catch(() => {});
        skipped++;
        continue;
      }

      // Fase 2: cobrança JÁ existe no gateway → nunca mais apagar a fatura nem
      // re-cobrar. Mesmo se anexar/notificar falhar, marcamos como enviado.
      try {
        const invoice = await this.invoices.attachCharge(reserved.id, {
          gatewayId: charge.gatewayId,
          pixCopyPaste: charge.pixCopyPaste,
          pixQrCode: charge.pixQrCode,
          checkoutUrl: charge.checkoutUrl,
        });
        const dto: TriggerNotificationDTO = {
          id: invoice.id,
          status: invoice.status,
          document: c.client?.document ?? '',
          phone,
          clientName: c.client?.name ?? '',
          value,
          step: 1, // standalone: o worker não mexe na régua/notificationSent
          message: buildWinbackMessage(c.client?.name ?? '', value, settings.discountPercent, settings.message),
        };
        await this.notifications.queueOverdueInvoices([dto]);
        await this.repo.markSent(c.id, invoice.id, now);
      } catch (err) {
        console.error('⚠️ Winback: cobrança criada mas pós-processo falhou (marca enviado p/ não re-cobrar):', err);
        await this.repo.markSent(c.id, reserved.id, now).catch(() => {});
      }
      sent++;
    }

    return { enrolled, sent, skipped };
  }
}
