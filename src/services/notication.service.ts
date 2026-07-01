import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import { publishRabbitMql } from '../messaging/publish/publish.messaging.js';
import { INVOICE_QUEUE } from '../messaging/invoice-queue.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { requireTenantId } from '../context/tenant-context.js';

export class NotificationService {
  private readonly queueName = INVOICE_QUEUE;
  private readonly invoiceRepository: InvoiceRepository;

  constructor() {
    this.invoiceRepository = new InvoiceRepository();
  }

  private async enqueue(
    invoice: TriggerNotificationDTO
  ): Promise<void> {
    // Carimba o tenant do contexto no payload para o worker operar no escopo certo (RN-T5).
    const payload: TriggerNotificationDTO = {
      ...invoice,
      tenantId: requireTenantId(),
    };

    await publishRabbitMql(
      this.queueName,
      JSON.stringify(payload)
    );
  }

  async queueOverdueInvoices(
    invoices: TriggerNotificationDTO[]
  ): Promise<{ enqueued: number }> {
    for (const invoice of invoices) {
      await this.enqueue(invoice);
    }

    return {
      enqueued: invoices.length,
    };
  }

  async triggerByInvoice(
    invoiceId: string
  ): Promise<void> {
    const invoice =
      await this.invoiceRepository.findNotificationDataById(
        invoiceId
      );

    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND');
    }

    await this.enqueue(invoice);
  }

  async sendNotificationByUser(
    invoice: TriggerNotificationDTO
  ): Promise<void> {
    await this.enqueue(invoice);
  }
}