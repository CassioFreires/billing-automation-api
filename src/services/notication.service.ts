import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import { publishRabbitMql } from '../messaging/publish/publish.messaging.js';
import { INVOICE_QUEUE } from '../messaging/invoice-queue.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';

export class NotificationService {
  private readonly queueName = INVOICE_QUEUE;
  private readonly invoiceRepository: InvoiceRepository;

  constructor() {
    this.invoiceRepository = new InvoiceRepository();
  }

  private async enqueue(
    invoice: TriggerNotificationDTO
  ): Promise<void> {
    await publishRabbitMql(
      this.queueName,
      JSON.stringify(invoice)
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