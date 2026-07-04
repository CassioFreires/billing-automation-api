

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import {
  PaymentGatewayProvider,
  WebhookResult,
  resolvePaymentGatewayForTenant,
} from '../apis/payment/index.js';
import { PaymentSettingService } from './payment-setting.service.js';
import { CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../dtos/createInvoice.dto.js';
import { canTransitionInvoice } from '../domain/status.js';

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

  constructor(deps?: {
    invoiceRepository?: InvoiceRepository;
    gateway?: PaymentGatewayProvider;
    paymentSettings?: PaymentSettingService;
  }) {
    this.invoiceRepository = deps?.invoiceRepository ?? new InvoiceRepository();
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

      return await this.invoiceRepository.attachCharge(reserved.id, {
        gatewayId: charge.gatewayId,
        pixCopyPaste: charge.pixCopyPaste,
        pixQrCode: charge.pixQrCode,
        checkoutUrl: charge.checkoutUrl,
      });
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
