import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';
import { header, hmacHex, rawBodyString, safeEqual, INVALID_SIGNATURE } from './webhook-verify.js';

/**
 * Integração com o Pagar.me v5 (spec 0019) via Orders + Checkout.
 * `POST /orders` com `payments[].payment_method='checkout'` devolve um
 * `payment_url` hospedado (PIX + boleto + cartão). Usamos `code` = NOSSA
 * `reference` (localizador no webhook).
 *
 * Auth: Basic base64(`<secretKey>:`).
 * ⚠️ Assinatura (D-23): webhook assina o corpo cru em `X-Hub-Signature`
 * (`sha256=<hex>`). Ver `rawBodyString`.
 */
export interface PagarmeConfig {
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  successUrl?: string;
}

/** Status do Pagar.me → status interno. */
export function mapPagarmeStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'pending':
    case 'processing':
    case 'authorized_pending_capture':
      return 'PENDING';
    case 'failed':
    case 'canceled':
    case 'not_authorized':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

export class PagarmeGateway implements PaymentGatewayProvider {
  readonly name = 'pagarme';

  constructor(private readonly config: PagarmeConfig = {}) {}

  private baseUrl(): string {
    return this.config.baseUrl ?? process.env.PAGARME_BASE_URL ?? 'https://api.pagar.me/core/v5';
  }

  private authHeader(): string {
    const key = this.config.secretKey ?? process.env.PAGARME_SECRET_KEY;
    if (!key) throw new Error('PAGARME_SECRET_KEY não configurada');
    return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const success = this.config.successUrl ?? process.env.PAGARME_SUCCESS_URL;

    const res = await fetch(`${this.baseUrl()}/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: input.reference,
        items: [
          {
            amount: Math.round(input.amount * 100), // CENTAVOS
            description: input.description ?? 'Cobrança',
            quantity: 1,
          },
        ],
        customer: input.payerEmail
          ? { email: input.payerEmail, name: input.description ?? 'Cliente' }
          : undefined,
        payments: [
          {
            payment_method: 'checkout',
            checkout: {
              accepted_payment_methods: ['credit_card', 'pix', 'boleto'],
              success_url: success,
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Pagar.me createCharge falhou (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as {
      id: string;
      code?: string;
      checkouts?: Array<{ payment_url?: string }>;
    };

    return {
      gatewayId: input.reference,
      checkoutUrl: data.checkouts?.[0]?.payment_url,
    };
  }

  extractReference(req: WebhookRequest): string | null {
    const body = (req.body ?? {}) as { data?: { code?: string } };
    return body.data?.code ?? null;
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const secret = this.config.webhookSecret ?? process.env.PAGARME_WEBHOOK_SECRET;
    if (!secret) throw new Error('PAGARME_WEBHOOK_SECRET não configurado');

    const provided = header(req, 'x-hub-signature');
    // Formato "sha256=<hex>" (aceita também o hex puro por robustez).
    const providedHex = provided?.includes('=') ? provided.split('=')[1] : provided;
    const expected = hmacHex(secret, rawBodyString(req));
    if (!providedHex || !safeEqual(expected, providedHex)) {
      throw new Error(INVALID_SIGNATURE);
    }

    const body = (req.body ?? {}) as {
      id?: string;
      type?: string;
      data?: { code?: string; status?: string; paid_at?: string };
    };

    const code = body.data?.code;
    const status = body.data?.status;
    if (!code || !status) return null;

    const mapped = mapPagarmeStatus(status);
    return {
      eventId: body.id,
      gatewayId: code,
      status: mapped,
      paidAt: body.data?.paid_at ? new Date(body.data.paid_at) : mapped === 'PAID' ? new Date() : undefined,
    };
  }
}
