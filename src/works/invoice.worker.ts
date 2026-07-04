// src/works/invoice.worker.ts
import { rabbitMQ } from '../config/rabbitmql.config.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI, resolveWhatsappForTenant } from '../apis/whatsapp.api.js';
import { WhatsappSettingService } from '../services/whatsapp-setting.service.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import {
  INVOICE_QUEUE,
  INVOICE_DELIVERY_LIMIT,
  assertInvoiceQueueTopology,
} from '../messaging/invoice-queue.js';
import { runWithTenant } from '../context/tenant-context.js';
import { PermanentError, shouldRequeue } from '../infrastructure/errors.js';

const invoiceRepository = new InvoiceRepository();
const whatsappSettings = new WhatsappSettingService();

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
        let data: TriggerNotificationDTO;
        try {
          data = JSON.parse(msg.content.toString());
        } catch {
          // JSON inválido não melhora com retry → permanente (vai p/ DLQ).
          throw new PermanentError('Mensagem malformada (JSON inválido)');
        }

        console.log(`📩 Invoice recebida: ${data.id}`);

        if (!data.tenantId) {
          // Payload sem tenantId é irrecuperável → permanente (vai p/ DLQ,
          // fica inspecionável em vez de sumir com um ack silencioso).
          throw new PermanentError(`Mensagem sem tenantId: ${data.id ?? '?'}`);
        }

        await runWithTenant(data.tenantId, async () => {
          // Usa os dados REAIS da fatura (pix/checkout do gateway), não fabrica.
          const invoice = await invoiceRepository.findNotificationDataById(data.id);

          if (!invoice) {
            console.error(`❌ Fatura não encontrada: ${data.id}`);
            return;
          }

          // Resolve o provider de WhatsApp DO TENANT (spec 0014): cada empresa
          // envia pelo próprio número. Sem config, cai no log (não envia).
          const whatsappConfig = await whatsappSettings.getForCurrentTenant();
          const whatsappAPI = new WhatsappAPI(resolveWhatsappForTenant(whatsappConfig));

          // Envia PRIMEIRO; só marca como notificada se o envio deu certo.
          const result = await whatsappAPI.sendMessageWhatsapp(data, {
            targetPhone: invoice.phone,
            messagePayload: buildChargeMessage({
              clientName: invoice.clientName,
              value: invoice.value,
              checkoutUrl: invoice.checkoutUrl,
              pixCopyPaste: invoice.pixCopyPaste,
            }),
          });

          // Falha de envio → lança para cair no catch (nack → retry → DLQ),
          // em vez de "engolir" e perder a cobrança.
          if (!result.success) {
            throw new Error(`Falha no envio WhatsApp (${result.provider}): ${result.error}`);
          }

          await invoiceRepository.markNotificationSent(data.id);

          console.log(`✅ Processado: ${data.id}`);
        });

        channel.ack(msg);
      } catch (err) {
        // Erro PERMANENTE (payload inválido) → sem requeue: o nack manda direto
        // para a DLQ (via DLX), sem gastar reentregas.
        // Erro TRANSITÓRIO → requeue: o x-delivery-limit da quorum queue limita
        // o retry e, após INVOICE_DELIVERY_LIMIT, também manda para a DLQ (D-04).
        const requeue = shouldRequeue(err);
        if (requeue) {
          console.error(
            `❌ erro transitório (entrega ${deliveryCount + 1}/${INVOICE_DELIVERY_LIMIT + 1}):`,
            err
          );
        } else {
          console.error(
            `🚫 erro permanente → DLQ:`,
            err instanceof Error ? err.message : err
          );
        }

        channel.nack(msg, false, requeue);
      }
    },
    { noAck: false }
  );
}
