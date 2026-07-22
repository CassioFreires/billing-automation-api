// src/works/invoice.worker.ts
import { rabbitMQ } from '../config/rabbitmql.config.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { WhatsappAPI, resolveWhatsappForTenant } from '../apis/whatsapp.api.js';
import { EmailAPI } from '../apis/email.api.js';
import { WhatsappSettingService } from '../services/whatsapp-setting.service.js';
import { ChannelSettingService } from '../services/channel-setting.service.js';
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import {
  INVOICE_QUEUE,
  INVOICE_DELIVERY_LIMIT,
  assertInvoiceQueueTopology,
} from '../messaging/invoice-queue.js';
import { runWithTenant } from '../context/tenant-context.js';
import { PermanentError, shouldRequeue } from '../infrastructure/errors.js';
import { InteractionEventRepository } from '../repositories/interaction-event.repository.js';
import { InteractionType, InteractionChannel } from '../domain/interaction.js';
import { resolveChannels } from '../domain/channels.js';

const invoiceRepository = new InvoiceRepository();
const whatsappSettings = new WhatsappSettingService();
const channelSettings = new ChannelSettingService();
const emailAPI = new EmailAPI();
const interactionEvents = new InteractionEventRepository();

interface ChargeMessageData {
  clientName: string;
  value: number | null;
  /** Link PRÓPRIO do Adimplo (Elo, spec 0016). Preferido — registra a abertura. */
  linkUrl?: string | null;
  checkoutUrl?: string | null;
  pixCopyPaste?: string | null;
  /** Texto do passo da régua (spec 0026); substitui o cabeçalho padrão se presente. */
  intro?: string | null;
}

/** Monta a mensagem de cobrança com os dados REAIS da fatura (D-15). */
export function buildChargeMessage(data: ChargeMessageData): string {
  // Régua (spec 0026): se o passo trouxe um texto, ele é o cabeçalho; senão, o padrão.
  const lines = data.intro
    ? [data.intro]
    : [`Olá ${data.clientName}`, `Valor: R$ ${Number(data.value ?? 0).toFixed(2)}`];

  // Preferência: link próprio (Elo) → checkout do gateway → PIX cru. O link
  // próprio é o que permite detectar dúvida (open) e a autonegociação (M2).
  if (data.linkUrl) {
    lines.push(`Pague aqui: ${data.linkUrl}`);
  } else if (data.checkoutUrl) {
    lines.push(`Pague aqui: ${data.checkoutUrl}`);
  } else if (data.pixCopyPaste) {
    lines.push(`PIX: ${data.pixCopyPaste}`);
  }

  return lines.join('\n');
}

/** Assunto do e-mail de cobrança (spec 0032). Curto e reconhecível. */
export function buildChargeSubject(data: { clientName: string }): string {
  return `Cobrança em aberto — ${data.clientName}`;
}

/** Base pública para o link do Elo (`APP_URL/r/:token`). Sem barra final. */
function appBaseUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
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

          // Link próprio do Elo (spec 0016): a mensagem aponta para o Adimplo,
          // não direto para o gateway — é o que captura "open" e habilita o M2.
          const linkUrl = invoice.linkToken
            ? `${appBaseUrl()}/r/${invoice.linkToken}`
            : undefined;

          // Corpo compartilhado entre os canais (a régua já injeta o `intro`).
          const messageBody = buildChargeMessage({
            clientName: invoice.clientName,
            value: invoice.value,
            linkUrl,
            checkoutUrl: invoice.checkoutUrl,
            pixCopyPaste: invoice.pixCopyPaste,
            intro: data.message, // texto do passo da régua (spec 0026), se houver
          });

          // Canais de envio DO TENANT (spec 0032): whatsapp | email | both, com
          // fallback para WhatsApp quando o cliente não tem e-mail.
          const { channel: preferred } = await channelSettings.get();
          const channels = resolveChannels(preferred, { hasEmail: Boolean(invoice.email) });

          // Registro best-effort do evento `sent` por canal (não derruba o ack).
          const recordSent = async (channel: string, provider: string) => {
            try {
              await interactionEvents.record({
                type: InteractionType.SENT,
                tenantId: data.tenantId!,
                invoiceId: invoice.id,
                clientId: invoice.clientId,
                channel,
                metadata: { provider, ...(data.step ? { step: data.step } : {}) },
              });
            } catch (err) {
              console.error('⚠️ Falha ao registrar evento sent (segue):', err);
            }
          };

          // Envia por cada canal resolvido. Sucesso em QUALQUER canal já conta
          // como notificada; falha em todos → lança (nack → retry → DLQ).
          let anySuccess = false;

          for (const ch of channels) {
            if (ch === 'whatsapp') {
              // Provider de WhatsApp DO TENANT (spec 0014): cada empresa pelo
              // próprio número. Sem config, cai no log (não envia de verdade).
              const whatsappConfig = await whatsappSettings.getForCurrentTenant();
              const whatsappAPI = new WhatsappAPI(resolveWhatsappForTenant(whatsappConfig));
              const result = await whatsappAPI.sendMessageWhatsapp(data, {
                targetPhone: invoice.phone,
                messagePayload: messageBody,
              });
              if (result.success) {
                anySuccess = true;
                await recordSent(InteractionChannel.WHATSAPP, result.provider);
              } else {
                console.error(`⚠️ Falha WhatsApp (${result.provider}): ${result.error}`);
              }
            } else if (ch === 'email' && invoice.email) {
              const result = await emailAPI.sendEmail({
                to: invoice.email,
                subject: buildChargeSubject({ clientName: invoice.clientName }),
                body: messageBody,
              });
              if (result.success) {
                anySuccess = true;
                await recordSent(InteractionChannel.EMAIL, result.provider);
              } else {
                console.error(`⚠️ Falha e-mail (${result.provider}): ${result.error}`);
              }
            }
          }

          if (!anySuccess) {
            throw new Error(
              `Falha no envio da cobrança ${data.id} em todos os canais (${channels.join(', ')})`
            );
          }

          // Régua (spec 0026): o passo já foi avançado pelo agendador ao enfileirar;
          // aqui só garantimos a marca de "notificada" nos envios sem passo (legado/avulso).
          if (data.step === undefined) {
            await invoiceRepository.markNotificationSent(data.id);
          }

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
