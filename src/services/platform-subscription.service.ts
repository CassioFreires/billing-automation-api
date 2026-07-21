import { randomUUID } from 'node:crypto';
import { PlatformSubscriptionRepository } from '../repositories/platform-subscription.repository.js';
import { PlatformInvoiceRepository } from '../repositories/platform-invoice.repository.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { resolvePlatformGateway, resolvePaymentGatewayByName } from '../apis/payment/index.js';
import { WebhookRequest } from '../apis/payment/types.js';
import { runWithTenant, requireTenantId } from '../context/tenant-context.js';
import { periodOf } from '../utils/recurrence.js';
import {
  PLANS,
  PlanId,
  isPlanId,
  resolveEntitlements,
  isOverInvoiceQuota,
  Entitlements,
  nextPeriodEnd,
} from '../domain/plans.js';

/** Erros de domínio da cobrança do SaaS (o controller mapeia p/ HTTP). */
export class BillingError extends Error {
  constructor(public code: 'INVALID_PLAN' | 'NOT_FOUND') {
    super(code);
  }
}

export class PlatformSubscriptionService {
  private subs: PlatformSubscriptionRepository;
  private invoices: PlatformInvoiceRepository;
  private tenantInvoices: InvoiceRepository;

  constructor(deps?: {
    subs?: PlatformSubscriptionRepository;
    invoices?: PlatformInvoiceRepository;
    tenantInvoices?: InvoiceRepository;
  }) {
    this.subs = deps?.subs ?? new PlatformSubscriptionRepository();
    this.invoices = deps?.invoices ?? new PlatformInvoiceRepository();
    this.tenantInvoices = deps?.tenantInvoices ?? new InvoiceRepository();
  }

  /** Entitlements do tenant atual (usado por middleware, quota e feature gates). */
  async entitlementsForCurrentTenant(now: Date = new Date()): Promise<Entitlements> {
    const sub = await this.subs.findByTenant();
    return resolveEntitlements(sub, now);
  }

  /** true se emitir mais uma fatura estoura a quota do plano (spec 0020). */
  async isInvoiceQuotaExceeded(now: Date = new Date()): Promise<boolean> {
    const ent = await this.entitlementsForCurrentTenant(now);
    const count = await this.tenantInvoices.countCreatedThisMonth(now);
    return isOverInvoiceQuota(count, ent);
  }

  /** Estado do plano p/ a tela: plano, status, entitlements, uso e catálogo. */
  async getStatus(now: Date = new Date()) {
    const sub = await this.subs.findByTenant();
    const ent = resolveEntitlements(sub, now);
    const invoicesThisMonth = await this.tenantInvoices.countCreatedThisMonth(now);

    return {
      plan: sub?.plan ?? 'free',
      status: sub?.status ?? 'trialing',
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      entitlements: ent,
      usage: {
        invoicesThisMonth,
        maxInvoicesPerMonth: ent.maxInvoicesPerMonth,
        overQuota: isOverInvoiceQuota(invoicesThisMonth, ent),
      },
      catalog: Object.values(PLANS),
    };
  }

  /**
   * Inicia a troca de plano. Free → troca imediata (sem cobrança). Pago → cria
   * uma PlatformInvoice e cobra via gateway da plataforma; devolve o destino de
   * pagamento (checkout hospedado ou PIX).
   */
  async checkout(planRaw: string, now: Date = new Date()) {
    if (!isPlanId(planRaw)) throw new BillingError('INVALID_PLAN');
    const plan: PlanId = planRaw;
    const def = PLANS[plan];

    if (def.priceCents === 0) {
      await this.subs.update(requireTenantId(), {
        plan: 'free',
        status: 'active',
        currentPeriodEnd: null,
      });
      return { switched: true as const };
    }

    const reference = randomUUID();
    const gateway = resolvePlatformGateway();
    const charge = await gateway.createCharge({
      reference,
      amount: def.priceCents / 100,
      dueDate: now,
      description: `Adimplo — assinatura ${def.label}`,
    });

    const created = await this.invoices.create({
      plan,
      amountCents: def.priceCents,
      period: periodOf(now),
      gatewayId: charge.gatewayId,
      checkoutUrl: charge.checkoutUrl,
      pixCopyPaste: charge.pixCopyPaste,
    });

    return {
      switched: false as const,
      platformInvoiceId: created.id,
      checkoutUrl: charge.checkoutUrl ?? null,
      pixCopyPaste: charge.pixCopyPaste ?? null,
    };
  }

  /** Faturas de plataforma do tenant atual. */
  async listInvoices() {
    return this.invoices.listByTenant();
  }

  /**
   * Webhook da cobrança de plataforma: verifica a assinatura, localiza a
   * PlatformInvoice pela referência e ATIVA/RENOVA a assinatura (idempotente).
   * Sem contexto de tenant (a fatura carrega o tenantId).
   */
  async confirmPayment(providerName: string, req: WebhookRequest) {
    const gateway = resolvePaymentGatewayByName(providerName);
    const event = await gateway.verifyAndParseWebhook(req);
    if (!event) return { ignored: true as const };
    if (event.status !== 'PAID') return { ignored: true as const };

    const inv = await this.invoices.findByGatewayId(event.gatewayId);
    if (!inv) throw new BillingError('NOT_FOUND');

    const { duplicate } = await this.invoices.confirmPaidAtomic({
      invoiceId: inv.id,
      tenantId: inv.tenantId,
      plan: inv.plan,
      paidAt: event.paidAt,
    });
    return { ignored: false as const, duplicate };
  }

  /**
   * Varredura (cron): expira trials vencidos e marca período pago vencido como
   * inadimplente (past_due). O tenant regulariza pagando (checkout → webhook).
   */
  async runRenewals(now: Date = new Date()) {
    const due = await this.subs.findDueForRenewal(now);
    let expired = 0;
    for (const sub of due) {
      await runWithTenant(sub.tenantId, async () => {
        await this.subs.update(sub.tenantId, { status: 'past_due' });
      });
      expired++;
    }
    return { processadas: due.length, inadimplentes: expired };
  }
}
