

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WebhookEventRepository } from '../repositories/webhook-event.repository.js';
import {
  PaymentGatewayProvider,
  WebhookResult,
  resolvePaymentGatewayForTenant,
} from '../apis/payment/index.js';
import { PaymentSettingService } from './payment-setting.service.js';
import { CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../dtos/createInvoice.dto.js';

export class InvoiceService {
  private invoiceRepository: InvoiceRepository;
  private webhookEvents: WebhookEventRepository;
  private injectedGateway?: PaymentGatewayProvider;
  private paymentSettings: PaymentSettingService;

  constructor(deps?: {
    invoiceRepository?: InvoiceRepository;
    webhookEvents?: WebhookEventRepository;
    gateway?: PaymentGatewayProvider;
    paymentSettings?: PaymentSettingService;
  }) {
    this.invoiceRepository = deps?.invoiceRepository ?? new InvoiceRepository();
    this.webhookEvents = deps?.webhookEvents ?? new WebhookEventRepository();
    this.injectedGateway = deps?.gateway;
    this.paymentSettings = deps?.paymentSettings ?? new PaymentSettingService();
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

    const gateway = await this.gatewayForTenant();
    const charge = await gateway.createCharge({
      reference,
      amount: total.toNumber(),
      dueDate: data.dueDate,
      description,
    });

    const invoice = await this.invoiceRepository.create({
      clientId: data.clientId,
      value: total,
      dueDate: data.dueDate,
      items,
      gatewayId: charge.gatewayId,
      pixCopyPaste: charge.pixCopyPaste,
      pixQrCode: charge.pixQrCode,
      checkoutUrl: charge.checkoutUrl,
    });

    return invoice;
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
    const gateway = await this.gatewayForTenant();
    const charge = await gateway.createCharge({
      reference,
      amount: input.amount,
      dueDate: input.dueDate,
      description: input.description,
    });

    const invoice = await this.invoiceRepository.create({
      clientId: input.clientId,
      value: input.amount,
      dueDate: input.dueDate,
      items: [{ description: input.description, quantity: 1, unitPrice: input.amount }],
      gatewayId: charge.gatewayId,
      pixCopyPaste: charge.pixCopyPaste,
      pixQrCode: charge.pixQrCode,
      checkoutUrl: charge.checkoutUrl,
      subscriptionId: input.subscriptionId,
      period: input.period,
    });

    return { created: true, invoice };
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

    if (event.eventId) {
      const isNew = await this.webhookEvents.recordIfNew(event.eventId, 'gateway');
      if (!isNew) {
        return { duplicate: true, invoice };
      }
    }

    const updated = await this.invoiceRepository.updateStatus(
      invoice.id,
      event.status,
      event.paidAt
    );

    return { duplicate: false, invoice: updated };
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
}
