/**
 * Seam de integração com E-MAIL (spec 0032), no mesmo molde de `whatsapp.api.ts`.
 *
 * Mock-first: o provider padrão `log` NÃO envia nada de verdade — só registra no
 * console. Plugar um provedor real (SMTP, SendGrid, SES) é só implementar
 * `EmailProvider` e apontar a env `EMAIL_PROVIDER`. Enquanto não há clientes, o
 * envio real fica de fora de propósito (mesma política do WhatsApp/gateway).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  to: string;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Provider padrão: só loga (não envia). Seguro para dev e para o estado atual. */
export class LogOnlyEmailProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.log(
      `✉️  [Email:log] (envio simulado) → ${message.to}\nAssunto: ${message.subject}\n${message.body}`
    );
    return { success: true, provider: this.name, to: message.to };
  }
}

/**
 * Resolve o provider a partir da env `EMAIL_PROVIDER`.
 * Default (não definida): `log` — não envia de verdade.
 */
export function resolveEmailProviderFromEnv(): EmailProvider {
  const selected = (process.env.EMAIL_PROVIDER ?? 'log').toLowerCase();

  switch (selected) {
    case 'log':
      return new LogOnlyEmailProvider();

    // case 'smtp':
    //   return new SmtpEmailProvider();
    // case 'sendgrid':
    //   return new SendgridEmailProvider();

    default:
      console.warn(
        `⚠️ EMAIL_PROVIDER='${selected}' não implementado. Usando 'log' como fallback.`
      );
      return new LogOnlyEmailProvider();
  }
}

export class EmailAPI {
  private readonly provider: EmailProvider;

  constructor(provider?: EmailProvider) {
    this.provider = provider ?? resolveEmailProviderFromEnv();
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    return this.provider.send(message);
  }
}
