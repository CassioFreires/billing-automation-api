import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';
import { header, sha256Hex, safeEqual, rawBodyString, INVALID_SIGNATURE } from './webhook-verify.js';

/**
 * Integração com o PagBank / PagSeguro (spec 0019) via Checkout API.
 * `POST /checkouts` devolve um link de pagamento (PIX + boleto + cartão).
 * Usamos `reference_id` = NOSSA `reference` (localizador no webhook).
 *
 * ⚠️ Autenticidade (D-23): a notificação traz `x-authenticity-token` =
 * SHA-256(corpoCru + token). Ver `rawBodyString` para a captura do corpo cru
 * em produção.
 */
export interface PagBankConfig {
  token?: string;
  baseUrl?: string;
  redirectUrl?: string;
  notificationUrl?: string;
}

/** Status de uma charge do PagBank → status interno. */
export function mapPagBankStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'PAID':
      return 'PAID';
    case 'AUTHORIZED':
    case 'WAITING':
    case 'IN_ANALYSIS':
      return 'PENDING';
    case 'DECLINED':
    case 'CANCELED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

export class PagBankGateway implements PaymentGatewayProvider {
  readonly name = 'pagbank';

  constructor(private readonly config: PagBankConfig = {}) {}

  private baseUrl(): string {
    return (
      this.config.baseUrl ??
      process.env.PAGBANK_BASE_URL ??
      'https://sandbox.api.pagseguro.com'
    );
  }

  private token(): string {
    const token = this.config.token ?? process.env.PAGBANK_TOKEN;
    if (!token) throw new Error('PAGBANK_TOKEN não configurado');
    return token;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const redirect = this.config.redirectUrl ?? process.env.PAGBANK_REDIRECT_URL;

    const res = await fetch(`${this.baseUrl()}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: input.reference,
        expiration_date: input.dueDate.toISOString(),
        customer: input.payerEmail ? { email: input.payerEmail } : undefined,
        items: [
          {
            name: input.description ?? 'Cobrança',
            quantity: 1,
            unit_amount: Math.round(input.amount * 100), // CENTAVOS
          },
        ],
        payment_methods: [
          { type: 'PIX' },
          { type: 'BOLETO' },
          { type: 'CREDIT_CARD' },
        ],
        redirect_url: redirect,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`PagBank createCharge falhou (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as {
      id: string;
      links?: Array<{ rel: string; href: string }>;
    };
    const pay = data.links?.find((l) => l.rel === 'PAY' || l.rel === 'pay');

    return {
      gatewayId: input.reference,
      checkoutUrl: pay?.href,
    };
  }

  extractReference(req: WebhookRequest): string | null {
    const body = (req.body ?? {}) as {
      reference_id?: string;
      charges?: Array<{ reference_id?: string }>;
    };
    return body.reference_id ?? body.charges?.[0]?.reference_id ?? null;
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const token = this.config.token ?? process.env.PAGBANK_TOKEN;
    if (!token) throw new Error('PAGBANK_TOKEN não configurado');

    const provided = header(req, 'x-authenticity-token');
    const expected = sha256Hex(`${rawBodyString(req)}${token}`);
    if (!provided || !safeEqual(provided, expected)) {
      throw new Error(INVALID_SIGNATURE);
    }

    const body = (req.body ?? {}) as {
      id?: string;
      reference_id?: string;
      charges?: Array<{
        id?: string;
        status?: string;
        reference_id?: string;
        paid_at?: string;
      }>;
    };

    const reference = body.reference_id ?? body.charges?.[0]?.reference_id;
    const charge = body.charges?.[0];
    if (!reference || !charge?.status) return null;

    return {
      eventId: charge.id ?? body.id,
      gatewayId: reference,
      status: mapPagBankStatus(charge.status),
      paidAt: charge.paid_at ? new Date(charge.paid_at) : undefined,
    };
  }
}
