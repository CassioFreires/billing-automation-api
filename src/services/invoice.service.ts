

import { randomUUID } from 'node:crypto';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WebhookEventRepository } from '../repositories/webhook-event.repository.js';
import { PaymentGatewayAPI, WebhookResult } from '../apis/payment/index.js';
import { CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../dtos/createInvoice.dto.js';

export class InvoiceService {
  private invoiceRepository: InvoiceRepository;
  private webhookEvents: WebhookEventRepository;
  private gateway: PaymentGatewayAPI;

  constructor(deps?: {
    invoiceRepository?: InvoiceRepository;
    webhookEvents?: WebhookEventRepository;
    gateway?: PaymentGatewayAPI;
  }) {
    this.invoiceRepository = deps?.invoiceRepository ?? new InvoiceRepository();
    this.webhookEvents = deps?.webhookEvents ?? new WebhookEventRepository();
    this.gateway = deps?.gateway ?? new PaymentGatewayAPI();
  }

  async createPayment(data: CreateInvoiceDTO) {
    // Referência interna única usada como localizador no gateway/webhook (RN-P2).
    const reference = randomUUID();

    const charge = await this.gateway.createCharge({
      reference,
      amount: data.value,
      dueDate: data.dueDate,
    });

    const invoice = await this.invoiceRepository.create({
      ...data,
      gatewayId: charge.gatewayId,
      pixCopyPaste: charge.pixCopyPaste,
      pixQrCode: charge.pixQrCode,
      checkoutUrl: charge.checkoutUrl,
    });

    return invoice;
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
