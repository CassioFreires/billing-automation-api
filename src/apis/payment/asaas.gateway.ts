import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';
import { header, safeEqual, INVALID_SIGNATURE } from './webhook-verify.js';

/**
 * Integração com o Asaas (spec 0019). API-first, PIX + boleto + cartão, muito
 * usada por PMEs. Cobrança via `POST /v3/payments` (billingType UNDEFINED deixa
 * o pagador escolher a forma na fatura hospedada, `invoiceUrl`).
 *
 * ⚠️ Pré-requisito de conta (D-23): o Asaas exige um `customer` na cobrança.
 * Como o seam não carrega a identidade do pagador, criamos um customer mínimo
 * on-the-fly (nome = descrição) e usamos NOSSA `reference` como
 * `externalReference` — que volta no webhook e localiza a fatura/tenant.
 */
export interface AsaasConfig {
  apiKey?: string;
  /** Token configurado no painel Asaas e enviado no header `asaas-access-token`. */
  webhookToken?: string;
  baseUrl?: string;
}

/** Mapeia o status do Asaas para o status interno da fatura. */
export function mapAsaasStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'PAID';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
      return 'PENDING';
    case 'OVERDUE':
      return 'OVERDUE';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'DELETED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/** Data no formato YYYY-MM-DD exigido pelo Asaas. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class AsaasGateway implements PaymentGatewayProvider {
  readonly name = 'asaas';

  constructor(private readonly config: AsaasConfig = {}) {}

  private baseUrl(): string {
    return (
      this.config.baseUrl ??
      process.env.ASAAS_BASE_URL ??
      'https://sandbox.asaas.com/api/v3'
    );
  }

  private apiKey(): string {
    const key = this.config.apiKey ?? process.env.ASAAS_API_KEY;
    if (!key) throw new Error('ASAAS_API_KEY não configurada');
    return key;
  }

  private headers(): Record<string, string> {
    return { access_token: this.apiKey(), 'Content-Type': 'application/json' };
  }

  /** Cria (ou reaproveita) um customer mínimo — Asaas o exige na cobrança. */
  private async ensureCustomer(input: CreateChargeInput): Promise<string> {
    const res = await fetch(`${this.baseUrl()}/customers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.description ?? 'Cliente',
        email: input.payerEmail,
        externalReference: input.reference,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Asaas createCustomer falhou (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const customer = await this.ensureCustomer(input);

    const res = await fetch(`${this.baseUrl()}/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        customer,
        billingType: 'UNDEFINED', // pagador escolhe PIX/boleto/cartão
        value: input.amount,
        dueDate: isoDate(input.dueDate),
        description: input.description,
        externalReference: input.reference,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Asaas createCharge falhou (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as { id: string; invoiceUrl?: string };

    return {
      // externalReference é o nosso localizador no webhook (RN-P2).
      gatewayId: input.reference,
      checkoutUrl: data.invoiceUrl,
    };
  }

  extractReference(req: WebhookRequest): string | null {
    const body = (req.body ?? {}) as { payment?: { externalReference?: string } };
    return body.payment?.externalReference ?? null;
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    // Autenticidade: o Asaas envia o token configurado no header (RN-P4).
    const expected = this.config.webhookToken ?? process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) throw new Error('ASAAS_WEBHOOK_TOKEN não configurado');
    const provided = header(req, 'asaas-access-token');
    if (!provided || !safeEqual(provided, expected)) {
      throw new Error(INVALID_SIGNATURE);
    }

    const body = (req.body ?? {}) as {
      event?: string;
      payment?: {
        id?: string;
        status?: string;
        externalReference?: string;
        paymentDate?: string;
        confirmedDate?: string;
      };
    };

    const payment = body.payment;
    if (!payment?.externalReference || !payment.status) return null;

    const paidAt =
      payment.confirmedDate ?? payment.paymentDate
        ? new Date((payment.confirmedDate ?? payment.paymentDate) as string)
        : undefined;

    return {
      eventId: payment.id, // idempotência por pagamento
      gatewayId: payment.externalReference,
      status: mapAsaasStatus(payment.status),
      paidAt,
    };
  }
}
