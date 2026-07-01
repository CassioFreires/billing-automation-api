import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

/**
 * Seam de integração com WhatsApp.
 *
 * Hoje o envio real ainda não está implementado (dívida D-02). Em vez de um
 * stub cru, esta camada define um CONTRATO (`WhatsappProvider`) e um provider
 * padrão `log-only`, para que plugar um provedor real (Meta Cloud API, Twilio,
 * etc.) seja só implementar a interface e apontar a env `WHATSAPP_PROVIDER`.
 *
 * A seleção acontece em `resolveProviderFromEnv()` — o resto da aplicação
 * continua chamando `whatsappAPI.sendMessageWhatsapp(...)` sem saber qual
 * provider está por trás.
 */

export interface WhatsappMessage {
  targetPhone: string;
  messagePayload: string;
}

export interface WhatsappSendResult {
  success: boolean;
  /** Nome do provider que processou o envio (ex.: 'log', 'cloud', 'twilio'). */
  provider: string;
  targetPhone: string;
  /** ID da mensagem no provedor, quando houver. */
  providerMessageId?: string;
  /** Mensagem de erro quando `success = false`. */
  error?: string;
}

export interface WhatsappProvider {
  readonly name: string;
  send(message: WhatsappMessage): Promise<WhatsappSendResult>;
}

/**
 * Provider padrão: NÃO envia nada de verdade — apenas registra no log.
 * Seguro para desenvolvimento e para o estado atual do projeto.
 */
export class LogOnlyWhatsappProvider implements WhatsappProvider {
  readonly name = 'log';

  async send(message: WhatsappMessage): Promise<WhatsappSendResult> {
    console.log(
      `📱 [WhatsApp:log] (envio simulado) → ${message.targetPhone}\n${message.messagePayload}`
    );

    return {
      success: true,
      provider: this.name,
      targetPhone: message.targetPhone,
    };
  }
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * COMO PLUGAR UM PROVEDOR REAL (dívida D-02)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Crie uma classe que implemente `WhatsappProvider`, ex.:
 *
 *      export class CloudApiWhatsappProvider implements WhatsappProvider {
 *        readonly name = 'cloud';
 *        async send(message: WhatsappMessage): Promise<WhatsappSendResult> {
 *          const res = await fetch(
 *            `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
 *            {
 *              method: 'POST',
 *              headers: {
 *                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
 *                'Content-Type': 'application/json',
 *              },
 *              body: JSON.stringify({
 *                messaging_product: 'whatsapp',
 *                to: message.targetPhone,
 *                type: 'text',
 *                text: { body: message.messagePayload },
 *              }),
 *            }
 *          );
 *          if (!res.ok) {
 *            return { success: false, provider: this.name,
 *                     targetPhone: message.targetPhone, error: await res.text() };
 *          }
 *          const body = await res.json();
 *          return { success: true, provider: this.name,
 *                   targetPhone: message.targetPhone,
 *                   providerMessageId: body.messages?.[0]?.id };
 *        }
 *      }
 *
 * 2. Registre-a no `resolveProviderFromEnv()` abaixo (case 'cloud').
 * 3. Defina `WHATSAPP_PROVIDER=cloud` e as credenciais no `.env`.
 * 4. Atualize SDD/context/tech-stack.md e mova D-02 para "Resolvidos".
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Resolve o provider a partir da env `WHATSAPP_PROVIDER`.
 * Default (não definida): `log` — não envia de verdade.
 */
export function resolveProviderFromEnv(): WhatsappProvider {
  const selected = (process.env.WHATSAPP_PROVIDER ?? 'log').toLowerCase();

  switch (selected) {
    case 'log':
      return new LogOnlyWhatsappProvider();

    // case 'cloud':
    //   return new CloudApiWhatsappProvider();
    // case 'twilio':
    //   return new TwilioWhatsappProvider();

    default:
      console.warn(
        `⚠️ WHATSAPP_PROVIDER='${selected}' não implementado. Usando 'log' como fallback.`
      );
      return new LogOnlyWhatsappProvider();
  }
}

export class WhatsappAPI {
  private readonly provider: WhatsappProvider;

  constructor(provider?: WhatsappProvider) {
    this.provider = provider ?? resolveProviderFromEnv();
  }

  /**
   * Envia a mensagem de cobrança via provider ativo.
   * `data` fica disponível para futura parametrização (templates, contexto).
   */
  async sendMessageWhatsapp(
    _data: TriggerNotificationDTO,
    message: WhatsappMessage
  ): Promise<WhatsappSendResult> {
    return this.provider.send(message);
  }
}
