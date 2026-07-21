import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';

/** Mapeia o status do pagamento do Mercado Pago para o status da fatura (RN-P5). */
export function mapMercadoPagoStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'approved':
      return 'PAID';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'PENDING';
    case 'rejected':
    case 'cancelled':
    case 'refunded':
    case 'charged_back':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/** Config por tenant (spec 0019); cai para as envs quando não informada. */
export interface MercadoPagoConfig {
  accessToken?: string;
  webhookSecret?: string;
  baseUrl?: string;
  notificationUrl?: string;
}

/**
 * Integração com o Mercado Pago via Checkout Pro (preferences).
 * A preferência oferece PIX, cartão de crédito/débito e boleto na página
 * hospedada pelo MP. O webhook consulta o pagamento e mapeia o status.
 */
export class MercadoPagoGateway implements PaymentGatewayProvider {
  readonly name = 'mercadopago';

  constructor(private readonly config: MercadoPagoConfig = {}) {}

  private baseUrl(): string {
    return this.config.baseUrl ?? process.env.MP_BASE_URL ?? 'https://api.mercadopago.com';
  }

  private accessToken(): string {
    const token = this.config.accessToken ?? process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error('MP_ACCESS_TOKEN não configurado');
    return token;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl()}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: input.description ?? 'Cobrança',
            quantity: 1,
            unit_price: input.amount,
            currency_id: 'BRL',
          },
        ],
        external_reference: input.reference,
        notification_url: this.config.notificationUrl ?? process.env.MP_NOTIFICATION_URL,
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Mercado Pago createCharge falhou (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as {
      id: string | number;
      init_point?: string;
      sandbox_init_point?: string;
    };

    return {
      gatewayId: input.reference,
      checkoutUrl: data.sandbox_init_point ?? data.init_point,
    };
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const query = req.query ?? {};
    const body = (req.body ?? {}) as { type?: string; data?: { id?: string | number } };

    const type = (query['type'] as string) ?? body.type;
    if (type !== 'payment') {
      // Só tratamos notificações de pagamento; o resto é ignorado.
      return null;
    }

    const dataId =
      (query['data.id'] as string) ??
      (body.data?.id !== undefined ? String(body.data.id) : undefined);

    if (!dataId) return null;

    this.verifySignature(req, dataId);

    // Consulta o pagamento para obter status e referência.
    const res = await fetch(`${this.baseUrl()}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${this.accessToken()}` },
    });

    if (!res.ok) {
      throw new Error(`Mercado Pago getPayment falhou (${res.status})`);
    }

    const payment = (await res.json()) as {
      id: string | number;
      status: string;
      external_reference?: string;
      date_approved?: string;
    };

    if (!payment.external_reference) return null;

    return {
      eventId: String(payment.id),
      gatewayId: payment.external_reference,
      status: mapMercadoPagoStatus(payment.status),
      paidAt: payment.date_approved ? new Date(payment.date_approved) : undefined,
    };
  }

  /** Valida a assinatura `x-signature` do Mercado Pago (HMAC-SHA256). */
  private verifySignature(req: WebhookRequest, dataId: string): void {
    const secret = this.config.webhookSecret ?? process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('MP_WEBHOOK_SECRET não configurado');
    }

    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    if (typeof signature !== 'string') {
      throw new Error('WEBHOOK_INVALID_SIGNATURE');
    }

    // x-signature: "ts=<ts>,v1=<hash>"
    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k?.trim(), v?.trim()];
      })
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) {
      throw new Error('WEBHOOK_INVALID_SIGNATURE');
    }

    const manifest = `id:${dataId};request-id:${
      typeof requestId === 'string' ? requestId : ''
    };ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('WEBHOOK_INVALID_SIGNATURE');
    }
  }
}
