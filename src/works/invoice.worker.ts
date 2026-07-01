// src/works/invoice.worker.ts
import { rabbitMQ } from '../config/rabbitmql.config.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI } from '../apis/whatsapp.api.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import {
  INVOICE_QUEUE,
  INVOICE_DELIVERY_LIMIT,
  assertInvoiceQueueTopology,
} from '../messaging/invoice-queue.js';
import { runWithTenant } from '../context/tenant-context.js';

const invoiceRepository = new InvoiceRepository();
const whatsappAPI = new WhatsappAPI();

interface ChargeMessageData {
  clientName: string;
  value: number | null;
  checkoutUrl?: string | null;
  pixCopyPaste?: string | null;
}

/** Monta a mensagem de cobrança com os dados REAIS da fatura (D-15). */
export function buildChargeMessage(data: ChargeMessageData): string {
  const lines = [
    `Olá ${data.clientName}`,
    `Valor: R$ ${Number(data.value ?? 0).toFixed(2)}`,
  ];

  if (data.checkoutUrl) {
    lines.push(`Pague aqui: ${data.checkoutUrl}`);
  } else if (data.pixCopyPaste) {
    lines.push(`PIX: ${data.pixCopyPaste}`);
  }

  return lines.join('\n');
}

export async function initInvoiceWorker() {
  const channel = rabbitMQ.getChannel();

  await assertInvoiceQueueTopology(channel);

  channel.prefetch(1);

  console.log(`👂 Consumindo fila: ${INVOICE_QUEUE}`);

  channel.consume(
    INVOICE_QUEUE,
    async (msg) => {
      if (!msg) return;

      const deliveryCount = Number(
        msg.properties.headers?.['x-delivery-count'] ?? 0
      );

      try {
        const data: TriggerNotificationDTO = JSON.parse(
          msg.content.toString()
        );

        console.log(`📩 Invoice recebida: ${data.id}`);

        if (!data.tenantId) {
          console.error(`❌ Mensagem sem tenantId, descartada: ${data.id}`);
          channel.ack(msg);
          return;
        }

        await runWithTenant(data.tenantId, async () => {
          // Usa os dados REAIS da fatura (pix/checkout do gateway), não fabrica.
          const invoice = await invoiceRepository.findNotificationDataById(data.id);

          if (!invoice) {
            console.error(`❌ Fatura não encontrada: ${data.id}`);
            return;
          }

          await invoiceRepository.markNotificationSent(data.id);

          await whatsappAPI.sendMessageWhatsapp(data, {
            targetPhone: invoice.phone,
            messagePayload: buildChargeMessage({
              clientName: invoice.clientName,
              value: invoice.value,
              checkoutUrl: invoice.checkoutUrl,
              pixCopyPaste: invoice.pixCopyPaste,
            }),
          });

          console.log(`✅ Processado: ${data.id}`);
        });

        channel.ack(msg);
      } catch (err) {
        // Retry limitado: as quorum queues incrementam x-delivery-count a cada
        // reentrega e, ao passar de INVOICE_DELIVERY_LIMIT, mandam a mensagem
        // para a DLQ automaticamente — sem loop infinito (dívida D-04).
        console.error(
          `❌ erro worker (entrega ${deliveryCount + 1}/${INVOICE_DELIVERY_LIMIT + 1}):`,
          err
        );

        channel.nack(msg, false, true);
      }
    },
    { noAck: false }
  );
}
