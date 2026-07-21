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
 * Integração com o Stripe (spec 0019) via Checkout Session hospedada.
 * `POST /v1/checkout/sessions` (form-urlencoded) devolve a `url` de pagamento.
 * Usamos `client_reference_id` = NOSSA `reference` (localizador no webhook).
 *
 * Modo de teste: basta usar uma `secretKey` `sk_test_...`.
 * ⚠️ Assinatura (D-23): o Stripe assina o CORPO CRU. Ver `rawBodyString` —
 * em produção capture o corpo cru nesta rota para a verificação casar byte a byte.
 */
export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}

/** Status do checkout/payment_intent → status interno. */
export function mapStripeStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'complete':
    case 'paid':
    case 'succeeded':
      return 'PAID';
    case 'open':
    case 'processing':
    case 'requires_action':
      return 'PENDING';
    case 'expired':
    case 'canceled':
    case 'payment_failed':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

export class StripeGateway implements PaymentGatewayProvider {
  readonly name = 'stripe';

  constructor(private readonly config: StripeConfig = {}) {}

  private baseUrl(): string {
    return this.config.baseUrl ?? process.env.STRIPE_BASE_URL ?? 'https://api.stripe.com';
  }

  private secretKey(): string {
    const key = this.config.secretKey ?? process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada');
    return key;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const success = this.config.successUrl ?? process.env.STRIPE_SUCCESS_URL ?? '';
    const cancel = this.config.cancelUrl ?? process.env.STRIPE_CANCEL_URL ?? success;

    // Stripe trabalha em CENTAVOS (inteiro) e form-urlencoded.
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('client_reference_id', input.reference);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'brl');
    form.set('line_items[0][price_data][product_data][name]', input.description ?? 'Cobrança');
    form.set('line_items[0][price_data][unit_amount]', String(Math.round(input.amount * 100)));
    if (success) form.set('success_url', success);
    if (cancel) form.set('cancel_url', cancel);
    if (input.payerEmail) form.set('customer_email', input.payerEmail);

    const res = await fetch(`${this.baseUrl()}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Stripe createCharge falhou (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as { id: string; url?: string };

    return {
      gatewayId: input.reference, // = client_reference_id, volta no webhook
      checkoutUrl: data.url,
    };
  }

  extractReference(req: WebhookRequest): string | null {
    const body = (req.body ?? {}) as {
      data?: { object?: { client_reference_id?: string } };
    };
    return body.data?.object?.client_reference_id ?? null;
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const secret = this.config.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET não configurado');

    // Header: "t=<ts>,v1=<hash>"; assinatura = HMAC-SHA256(`${t}.${rawBody}`).
    const sig = header(req, 'stripe-signature');
    if (!sig) throw new Error(INVALID_SIGNATURE);
    const parts = Object.fromEntries(
      sig.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k?.trim(), v?.trim()];
      })
    );
    const t = parts['t'];
    const v1 = parts['v1'];
    if (!t || !v1) throw new Error(INVALID_SIGNATURE);

    const expected = hmacHex(secret, `${t}.${rawBodyString(req)}`);
    if (!safeEqual(expected, v1)) throw new Error(INVALID_SIGNATURE);

    const body = (req.body ?? {}) as {
      id?: string;
      type?: string;
      data?: {
        object?: {
          client_reference_id?: string;
          payment_status?: string;
          status?: string;
        };
      };
    };

    // Só tratamos a conclusão do checkout; o resto é ignorado.
    if (body.type !== 'checkout.session.completed') return null;

    const obj = body.data?.object;
    if (!obj?.client_reference_id) return null;

    const rawStatus = obj.payment_status ?? obj.status ?? 'complete';
    const status = mapStripeStatus(rawStatus);

    return {
      eventId: body.id, // idempotência pelo id do evento Stripe
      gatewayId: obj.client_reference_id,
      status,
      paidAt: status === 'PAID' ? new Date() : undefined,
    };
  }
}
