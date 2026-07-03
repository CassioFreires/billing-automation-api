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

/** Remove tudo que não é dígito. A Cloud API espera o número só com dígitos
 *  no padrão internacional (ex.: 5511999998888), sem '+', espaços ou traços. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export interface CloudWhatsappConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  baseUrl: string;
}

/** Lê e valida as credenciais da Cloud API. Falha alto se faltar algo — melhor
 *  quebrar no boot com mensagem clara do que enviar silenciosamente errado. */
export function requireCloudWhatsappConfig(): CloudWhatsappConfig {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "WHATSAPP_PROVIDER=cloud requer WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env"
    );
  }

  return {
    token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    baseUrl: process.env.WHATSAPP_BASE_URL ?? 'https://graph.facebook.com',
  };
}

/**
 * Provider real: WhatsApp Cloud API (Meta). Envia mensagem de TEXTO.
 *
 * ⚠️ LIMITE IMPORTANTE (regra da Meta): mensagem de texto livre só é entregue
 * a) para o número de TESTE da Meta (grátis, até 5 destinos), ou
 * b) dentro da janela de atendimento de 24h (o cliente te mandou msg antes).
 * Para cobrança iniciada por você fora dessa janela, a Meta EXIGE um
 * *template* aprovado (type: 'template'). Ver SDD/context/whatsapp-integration.md.
 * Suporte a template fica como próximo passo — este provider cobre teste/demo
 * e a janela de 24h.
 */
export class CloudApiWhatsappProvider implements WhatsappProvider {
  readonly name = 'cloud';
  private readonly config: CloudWhatsappConfig;

  constructor(config?: CloudWhatsappConfig) {
    this.config = config ?? requireCloudWhatsappConfig();
  }

  async send(message: WhatsappMessage): Promise<WhatsappSendResult> {
    const to = normalizePhoneDigits(message.targetPhone);
    const url = `${this.config.baseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: message.messagePayload },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          provider: this.name,
          targetPhone: to,
          error: `HTTP ${res.status}: ${errText}`,
        };
      }

      const body: any = await res.json().catch(() => ({}));
      return {
        success: true,
        provider: this.name,
        targetPhone: to,
        providerMessageId: body?.messages?.[0]?.id,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        targetPhone: to,
        error: err?.message ?? 'erro de rede ao chamar a Cloud API',
      };
    }
  }
}

/**
 * Resolve o provider a partir da env `WHATSAPP_PROVIDER`.
 * Default (não definida): `log` — não envia de verdade.
 */
export function resolveProviderFromEnv(): WhatsappProvider {
  const selected = (process.env.WHATSAPP_PROVIDER ?? 'log').toLowerCase();

  switch (selected) {
    case 'log':
      return new LogOnlyWhatsappProvider();

    case 'cloud':
      return new CloudApiWhatsappProvider();

    // case 'twilio':
    //   return new TwilioWhatsappProvider();

    default:
      console.warn(
        `⚠️ WHATSAPP_PROVIDER='${selected}' não implementado. Usando 'log' como fallback.`
      );
      return new LogOnlyWhatsappProvider();
  }
}

/** Config de WhatsApp de um tenant (spec 0014). */
export interface TenantWhatsappConfig {
  provider: string; // log | cloud
  token?: string | null;
  phoneNumberId?: string | null;
  apiVersion?: string | null;
}

/**
 * Resolve o provider a partir da config do TENANT (spec 0014): cada empresa
 * envia pelo próprio número. `cloud` usa as credenciais do tenant; sem elas
 * (ou provider 'log'), cai no log-only (não envia). Nunca quebra o worker.
 */
export function resolveWhatsappForTenant(config: TenantWhatsappConfig): WhatsappProvider {
  if ((config.provider ?? 'log').toLowerCase() !== 'cloud') {
    return new LogOnlyWhatsappProvider();
  }

  if (!config.token || !config.phoneNumberId) {
    console.warn('⚠️ WhatsApp cloud sem token/phoneNumberId no tenant — usando log.');
    return new LogOnlyWhatsappProvider();
  }

  return new CloudApiWhatsappProvider({
    token: config.token,
    phoneNumberId: config.phoneNumberId,
    apiVersion: config.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    baseUrl: process.env.WHATSAPP_BASE_URL ?? 'https://graph.facebook.com',
  });
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
