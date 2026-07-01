// src/works/invoice.worker.ts
import { rabbitMQ } from '../config/rabbitmql.config.js';
import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI } from '../apis/whatsapp.api.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import {
  INVOICE_QUEUE,
  INVOICE_DELIVERY_LIMIT,
  assertInvoiceQueueTopology,
} from '../messaging/invoice-queue.js';

const clientRepository = new ClientRepository();
const invoiceRepository = new InvoiceRepository();
const whatsappAPI = new WhatsappAPI();

export async function initInvoiceWorker() {
  const channel = rabbitMQ.getChannel();

  await assertInvoiceQueueTopology(channel);

  channel.prefetch(1);

  console.log(`👂 Consumindo fila: ${INVOICE_QUEUE}`);

  channel.consume(
    INVOICE_QUEUE,
    async (msg) => {
      if (!msg) return;

      // Contagem de entregas exposta pelas quorum queues (1 na 1ª entrega).
      const deliveryCount = Number(
        msg.properties.headers?.['x-delivery-count'] ?? 0
      );

      try {
        const data: TriggerNotificationDTO = JSON.parse(
          msg.content.toString()
        );

        console.log(`📩 Invoice recebida: ${data.id}`);

        const client = await clientRepository.findByPhone(data.phone);

        if (!client) {
          console.error(`❌ Cliente não encontrado: ${data.phone}`);
          channel.ack(msg);
          return;
        }

        const fakeGatewayId = 'pay_' + Math.random().toString(36).slice(2);
        const fakePix = '000201FAKEPIX_' + client.id;

        await invoiceRepository.updateNotificationData(
          data.id,
          fakeGatewayId,
          fakePix
        );

        const link = `http://localhost:3333/pay?invoice=${fakeGatewayId}`;

        await whatsappAPI.sendMessageWhatsapp(data, {
          targetPhone: client.phone,
          messagePayload:
            `Olá ${client.name}\n` +
            `Valor: R$ ${Number(data.value).toFixed(2)}\n` +
            `PIX: ${fakePix}\n` +
            `Link: ${link}`,
        });

        console.log(`✅ Processado: ${data.id}`);

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
