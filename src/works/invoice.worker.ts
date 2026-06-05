// src/works/invoice.worker.ts
import { rabbitMQ } from '../config/rabbitmql.config.js';
import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI } from '../apis/whatsapp.api.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

const clientRepository = new ClientRepository();
const invoiceRepository = new InvoiceRepository();
const whatsappAPI = new WhatsappAPI();

export async function initInvoiceWorker() {
  const channel = rabbitMQ.getChannel();
  const queue = 'invoice_processing_queue';

  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
    },
  });

  channel.prefetch(1);

  console.log(`👂 Consumindo fila: ${queue}`);

  channel.consume(
    queue,
    async (msg) => {
      if (!msg) return;

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
        console.error('❌ erro worker:', err);

        // retry com requeue
        channel.nack(msg, false, true);
      }
    },
    { noAck: false }
  );
}