

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { InteractionEventRepository } from '../repositories/interaction-event.repository.js';
import {
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
  resolvePaymentGatewayForTenant,
  resolvePaymentGatewayByName,
} from '../apis/payment/index.js';
import { PaymentSettingService } from './payment-setting.service.js';
import { CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../dtos/createInvoice.dto.js';
import { canTransitionInvoice } from '../domain/status.js';
import { InteractionType } from '../domain/interaction.js';
import { runWithTenant } from '../context/tenant-context.js';

/** Violação de unique (P2002) — usada para detectar corrida na reserva. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export class InvoiceService {
  private invoiceRepository: InvoiceRepository;
  private injectedGateway?: PaymentGatewayProvider;
  private paymentSettings: PaymentSettingService;
  private events: InteractionEventRepository;

  constructor(deps?: {
    invoiceRepository?: InvoiceRepository;
    gateway?: PaymentGatewayProvider;
    paymentSettings?: PaymentSettingService;
    events?: InteractionEventRepository;
  }) {
    this.invoiceRepository = deps?.invoiceRepository ?? new InvoiceRepository();
    this.injectedGateway = deps?.gateway;
    this.paymentSettings = deps?.paymentSettings ?? new PaymentSettingService();
    this.events = deps?.events ?? new InteractionEventRepository();
  }

  /**
   * Registra o `link_created` do Elo (spec 0016). Best-effort: um evento não
   * pode derrubar a criação da cobrança. `invoice` é o retorno de `attachCharge`.
   */
  private async recordLinkCreated(invoice: {
    id: string;
    tenantId: string;
    clientId: string;
  }): Promise<void> {
    try {
      await this.events.record({
        type: InteractionType.LINK_CREATED,
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
      });
    } catch (err) {
      console.error('⚠️ Falha ao registrar link_created (segue):', err);
    }
  }

  /**
   * Resolve o gateway do TENANT atual (spec 0012): usa a config da empresa
   * (provider + credenciais dela). Em testes, respeita o gateway injetado.
   */
  private async gatewayForTenant(): Promise<PaymentGatewayProvider> {
    if (this.injectedGateway) return this.injectedGateway;
    const config = await this.paymentSettings.getForCurrentTenant();
    return resolvePaymentGatewayForTenant(config);
  }

  async createPayment(data: CreateInvoiceDTO) {
    // Referência interna única usada como localizador no gateway/webhook (RN-P2).
    const reference = randomUUID();

    // Total = soma dos itens quando houver; senão, o value informado (RN-P6).
    // Soma em Decimal (exato) — nada de float em dinheiro.
    const items = data.items ?? [];
    const total: Prisma.Decimal = items.length
      ? items.reduce(
          (sum, it) => sum.plus(new Prisma.Decimal(it.unitPrice).times(it.quantity)),
          new Prisma.Decimal(0)
        )
      : new Prisma.Decimal(data.value ?? 0);

    // Descrição exibida no checkout do gateway (evita o genérico "Cobrança").
    const description = items.length
      ? items.map((it) => it.description).join(', ')
      : 'Cobrança';

    // Reserva a fatura ANTES de cobrar (sem dados de gateway). Assim, se o
    // gateway falhar, desfazemos a reserva e não fica cobrança órfã.
    const reserved = await this.invoiceRepository.create({
      clientId: data.clientId,
      value: total,
      dueDate: data.dueDate,
      items,
    });

    try {
      const gateway = await this.gatewayForTenant();
      const charge = await gateway.createCharge({
        reference,
        amount: total.toNumber(),
        dueDate: data.dueDate,
        description,
      });

      const invoice = await this.invoiceRepository.attachCharge(reserved.id, {
        gatewayId: charge.gatewayId,
        pixCopyPaste: charge.pixCopyPaste,
        pixQrCode: charge.pixQrCode,
        checkoutUrl: charge.checkoutUrl,
      });

      await this.recordLinkCreated(invoice);
      return invoice;
    } catch (error) {
      // Gateway falhou → desfaz a reserva para permitir um retry limpo.
      await this.invoiceRepository.deleteById(reserved.id).catch(() => {});
      throw error;
    }
  }

  /**
   * Gera a fatura de uma assinatura numa competência (spec 0009).
   * Idempotente: se já existe fatura para [subscriptionId, period], não
   * cria nova nem chama o gateway. Retorna { created, invoice }.
   */
  async createForSubscription(input: {
    subscriptionId: string;
    clientId: string;
    description: string;
    amount: number;
    dueDate: Date;
    period: string;
  }): Promise<{ created: boolean; invoice: unknown }> {
    const existing = await this.invoiceRepository.findBySubscriptionPeriod(
      input.subscriptionId,
      input.period
    );
    if (existing) {
      return { created: false, invoice: existing };
    }

    const reference = randomUUID();

    // Reserva a competência ANTES de cobrar. A unique [subscriptionId, period]
    // barra corridas (ex.: cron + /subscriptions/run manual ao mesmo tempo):
    // só um insert vence; o perdedor cai no P2002 e NÃO chama o gateway —
    // eliminando a cobrança duplicada.
    let reserved: { id: string };
    try {
      reserved = await this.invoiceRepository.create({
        clientId: input.clientId,
        value: input.amount,
        dueDate: input.dueDate,
        items: [{ description: input.description, quantity: 1, unitPrice: input.amount }],
        subscriptionId: input.subscriptionId,
        period: input.period,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const now = await this.invoiceRepository.findBySubscriptionPeriod(
          input.subscriptionId,
          input.period
        );
        return { created: false, invoice: now };
      }
      throw error;
    }

    try {
      const gateway = await this.gatewayForTenant();
      const charge = await gateway.createCharge({
        reference,
        amount: input.amount,
        dueDate: input.dueDate,
        description: input.description,
      });

      const invoice = await this.invoiceRepository.attachCharge(reserved.id, {
        gatewayId: charge.gatewayId,
        pixCopyPaste: charge.pixCopyPaste,
        pixQrCode: charge.pixQrCode,
        checkoutUrl: charge.checkoutUrl,
      });

      await this.recordLinkCreated(invoice);
      return { created: true, invoice };
    } catch (error) {
      await this.invoiceRepository.deleteById(reserved.id).catch(() => {});
      throw error;
    }
  }

  /**
   * Processa uma notificação de webhook já normalizada pelo provider,
   * de forma idempotente (RN-P3).
   */
  async applyWebhook(event: WebhookResult): Promise<{ duplicate: boolean; invoice: unknown }> {
    const invoice = await this.invoiceRepository.findByGatewayId(event.gatewayId);

    if (!invoice) {
      throw new Error('Fatura correspondente ao Gateway não encontrada.');
    }

    // Guarda de ordem/estado: só aplica transições válidas (ex.: PAID não
    // regride). Backstop atômico idêntico dentro de applyWebhookAtomic.
    if (!canTransitionInvoice(invoice.status, event.status)) {
      return { duplicate: false, invoice };
    }

    // Idempotência (registro do evento) + update do status na MESMA transação.
    return this.invoiceRepository.applyWebhookAtomic({
      invoiceId: invoice.id,
      eventId: event.eventId,
      provider: 'gateway',
      status: event.status,
      paidAt: event.paidAt,
    });
  }

  /**
   * Webhook multi-gateway (spec 0019). Roteado por `POST /webhook/:provider`.
   *
   * Fluxo em duas fases: (1) "espia" a NOSSA referência no payload (sem confiar
   * nela) para localizar a fatura e, com ela, o tenant; (2) carrega a credencial
   * DAQUELE tenant e verifica a assinatura de verdade. A mudança de estado só
   * ocorre se `verifyAndParseWebhook` validar a assinatura (que pode lançar
   * WEBHOOK_INVALID_SIGNATURE). Sem referência (ex.: Mercado Pago, mock), cai no
   * provider resolvido por env — preservando o comportamento legado.
   */
  async applyWebhookForProvider(
    providerName: string,
    req: WebhookRequest
  ): Promise<{ duplicate: boolean; ignored: boolean }> {
    const peeker = resolvePaymentGatewayByName(providerName);
    const reference = peeker.extractReference?.(req) ?? null;

    let gateway: PaymentGatewayProvider = peeker;
    if (reference) {
      const invoice = await this.invoiceRepository.findByGatewayId(reference);
      if (invoice) {
        // Credenciais do tenant DONO da fatura (segredos decifrados no service).
        const config = await runWithTenant(invoice.tenantId, () =>
          this.paymentSettings.getForCurrentTenant()
        );
        gateway = resolvePaymentGatewayForTenant(config);
      }
    }

    const event = await gateway.verifyAndParseWebhook(req);
    if (!event) return { duplicate: false, ignored: true };

    const result = await this.applyWebhook(event);
    return { duplicate: result.duplicate, ignored: false };
  }

  /** Compat: caminho antigo (payload já no formato interno). */
  async receiveWebhookNotification(data: UpdateInvoiceStatusDTO) {
    return this.applyWebhook({
      eventId: data.eventId,
      gatewayId: data.gatewayId,
      status: data.status,
      paidAt: data.paidAt,
    });
  }

  async findPendingInvoices(page?: number, limit?: number) {
    return this.invoiceRepository.findPendingInvoices(page, limit);
  }

  /** Lista todas as faturas do tenant (paginado, filtro opcional por status). */
  async listInvoices(page?: number, limit?: number, status?: string) {
    return this.invoiceRepository.findAll(page, limit, status);
  }

  /** Busca uma fatura do tenant pelo id (null se não existir). */
  async getInvoiceById(id: string) {
    return this.invoiceRepository.findById(id);
  }

  /**
   * Eventos de interação de uma fatura (Elo, spec 0016): a timeline + as
   * contagens por tipo (semente do Botão de Alívio / Cockpit). Escopado por
   * tenant — confirma que a fatura pertence ao tenant antes de ler os eventos.
   * Retorna `null` se a fatura não for do tenant (controller → 404).
   */
  async getInvoiceEvents(
    id: string
  ): Promise<{ events: unknown[]; counts: Record<string, number> } | null> {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) return null;

    const [events, counts] = await Promise.all([
      this.events.listByInvoice(id),
      this.events.countsByInvoice(id),
    ]);
    return { events, counts };
  }
}
