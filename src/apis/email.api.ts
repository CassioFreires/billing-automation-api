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
 * Configuração de SMTP, lida das envs. Genérica de propósito: as mesmas variáveis
 * atendem Resend, Brevo, Gmail, Amazon SES, Mailtrap, etc. — muda só host/porta/
 * credenciais. `from` é obrigatório porque `EmailMessage` não carrega remetente.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Lê e valida a config de SMTP das envs. Falha ALTO (throw) se faltar algo
 * essencial — melhor que enviar errado em silêncio (mesma filosofia do WhatsApp
 * `requireCloudWhatsappConfig`).
 */
export function requireSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? '587');

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('EMAIL_FROM');
  if (missing.length > 0) {
    throw new Error(
      `EMAIL_PROVIDER=smtp exige as variáveis: ${missing.join(', ')}. ` +
        `Configure-as no .env (ver .env.example).`
    );
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`SMTP_PORT inválida: '${process.env.SMTP_PORT}'.`);
  }

  // secure=true fala TLS direto (porta 465); false usa STARTTLS (587).
  // Default derivado da porta, sobrescrevível por SMTP_SECURE.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : port === 465;

  return { host: host!, port, secure, user: user!, pass: pass!, from: from! };
}

/**
 * Provider real via SMTP (nodemailer). Genérico: serve qualquer provedor SMTP
 * (Resend, Brevo, Gmail, SES, Mailtrap...) trocando só as envs. O transporter é
 * criado uma vez (lazy) e reutilizado. O `nodemailer` é importado dinamicamente
 * para não ser exigido quando o provider é `log`.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly config: SmtpConfig;
  private transporter: import('nodemailer').Transporter | null = null;

  constructor(config?: SmtpConfig) {
    this.config = config ?? requireSmtpConfig();
  }

  private async getTransporter(): Promise<import('nodemailer').Transporter> {
    if (this.transporter) return this.transporter;
    const nodemailer = await import('nodemailer');
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.pass },
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      return {
        success: true,
        provider: this.name,
        to: message.to,
        providerMessageId: info.messageId,
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        to: message.to,
        error: err instanceof Error ? err.message : String(err),
      };
    }
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

    case 'smtp':
      return new SmtpEmailProvider();

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
