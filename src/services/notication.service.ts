import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import { publishRabbitMql } from '../messaging/publish/publish.messaging.js';

export class NotificationService {
  async queueOverdueInvoices(invoices: TriggerNotificationDTO[]): Promise<{ enqueued: number }> {
    const queueName = 'invoice_processing_queue';
    let enqueued = 0;

    for (const invoice of invoices) {
      // Jogamos apenas o payload bruto do n8n para dentro do RabbitMQ
      const payload = JSON.stringify(invoice);

      await publishRabbitMql(queueName, payload);
      enqueued++;
    }

    return { enqueued };
  }
}