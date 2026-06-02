import { rabbitMQ } from '../config/rabbitmql.config.js';
import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI } from '../apis/whatsapp.api.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

const clientRepository = new ClientRepository();
const invoiceRepository = new InvoiceRepository();
const whatsappAPI = new WhatsappAPI();

export async function initInvoiceWorker() {
  const channel = rabbitMQ.channel;
  const queue = 'invoice_processing_queue';

  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum'
    }
  });

  channel.prefetch(1);

  console.log(`👂 Worker escutando fila: ${queue}`);

  channel.consume(
    queue,
    async (msg) => {
      if (!msg) return;

      try {
        const data: TriggerNotificationDTO = JSON.parse(
          msg.content.toString()
        );

        console.log(
          `📥 Recebida invoice ${data.id} para ${data.phone}`
        );

        const client = await clientRepository.findByPhone(
          data.phone
        );

        if (!client) {
          console.error(
            `❌ Cliente não encontrado para telefone ${data.phone}`
          );

          channel.ack(msg);
          return;
        }

        const fakeGatewayId =
          'pay_fake_' +
          Math.random().toString(36).substring(2, 10);

        const fakePixCode =
          '00020101021226880014br.gov.bcb.pix.COPIA_E_COLA_FAKE_' +
          client.id;

        await invoiceRepository.updateNotificationData(
          data.id,
          fakeGatewayId,
          fakePixCode
        );

        const linkPagamentoFake =
          `http://localhost:3333/pages/payments.screen.html` +
          `?invoiceId=${fakeGatewayId}` +
          `&value=${data.value}`;

        const mensagemWhatsapp = {
          targetPhone: client.phone,
          messagePayload:
            `Olá, ${client.name}!\n\n` +
            `Identificamos uma cobrança pendente de R$ ${Number(
              data.value
            ).toFixed(2)}.\n\n` +
            `👉 PIX Copia e Cola:\n` +
            `${fakePixCode}\n\n` +
            `🔗 Link para pagamento:\n` +
            `${linkPagamentoFake}`
        };

        await whatsappAPI.sendMessageWhatsapp(
          data,
          mensagemWhatsapp
        );

        console.log(
          `✅ Invoice ${data.id} processada para ${client.name}`
        );

        console.log(
          JSON.stringify(mensagemWhatsapp, null, 2)
        );

        channel.ack(msg);
      } catch (error) {
        console.error(
          '❌ Erro ao processar mensagem:',
          error
        );

        channel.nack(
          msg,
          false,
          true
        );
      }
    },
    {
      noAck: false
    }
  );
}