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
 * Integração com o Efí (ex-Gerencianet) — spec 0019. Foco em PMEs, API-first.
 * Fluxo: OAuth2 client_credentials → cria cobrança (`POST /v1/charge`) →
 * gera link de pagamento (`POST /v1/charge/{id}/link`). Usamos `metadata.custom_id`
 * = NOSSA `reference` (localizador no webhook).
 *
 * ⚠️ PIX exige certificado mTLS (`certificateBase64`) — boleto/cartão via link
 * funcionam só com client_id/secret. O certificado fica como pré-requisito de
 * produção para PIX (D-23).
 * ⚠️ Notificação: o Efí envia um TOKEN e o status deve ser consultado. Aqui
 * autenticamos por um token compartilhado no header e lemos `custom_id`+status;
 * a consulta oficial do token fica documentada (D-23).
 */
export interface EfiConfig {
  clientId?: string;
  clientSecret?: string;
  certificateBase64?: string;
  webhookToken?: string;
  baseUrl?: string;
}

/** Status do Efí → status interno da fatura. */
export function mapEfiStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'paid':
    case 'settled':
      return 'PAID';
    case 'new':
    case 'waiting':
    case 'link':
    case 'identified':
    case 'approved':
      return 'PENDING';
    case 'unpaid':
    case 'canceled':
    case 'expired':
    case 'refunded':
    case 'contested':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

export class EfiGateway implements PaymentGatewayProvider {
  readonly name = 'efi';

  constructor(private readonly config: EfiConfig = {}) {}

  private baseUrl(): string {
    // Homologação por padrão; produção via env.
    return (
      this.config.baseUrl ??
      process.env.EFI_BASE_URL ??
      'https://cobrancas-h.api.efipay.com.br'
    );
  }

  private async getToken(): Promise<string> {
    const id = this.config.clientId ?? process.env.EFI_CLIENT_ID;
    const secret = this.config.clientSecret ?? process.env.EFI_CLIENT_SECRET;
    if (!id || !secret) throw new Error('EFI_CLIENT_ID/EFI_CLIENT_SECRET não configurados');

    const res = await fetch(`${this.baseUrl()}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Efí oauth falhou (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const token = await this.getToken();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 1) Cria a cobrança com o nosso localizador em custom_id.
    const chargeRes = await fetch(`${this.baseUrl()}/v1/charge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        items: [
          {
            name: input.description ?? 'Cobrança',
            value: Math.round(input.amount * 100), // CENTAVOS
            amount: 1,
          },
        ],
        metadata: { custom_id: input.reference },
      }),
    });
    if (!chargeRes.ok) {
      const detail = await chargeRes.text();
      throw new Error(`Efí createCharge falhou (${chargeRes.status}): ${detail}`);
    }
    const charge = (await chargeRes.json()) as { data?: { charge_id?: number | string } };
    const chargeId = charge.data?.charge_id;
    if (!chargeId) throw new Error('Efí não retornou charge_id');

    // 2) Gera o link de pagamento (PIX/boleto/cartão conforme conta).
    const linkRes = await fetch(`${this.baseUrl()}/v1/charge/${chargeId}/link`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: input.description ?? 'Cobrança',
        expire_at: input.dueDate.toISOString().slice(0, 10),
        request_delivery_address: false,
        payment_method: 'all',
      }),
    });
    if (!linkRes.ok) {
      const detail = await linkRes.text();
      throw new Error(`Efí createLink falhou (${linkRes.status}): ${detail}`);
    }
    const link = (await linkRes.json()) as { data?: { payment_url?: string } };

    return {
      gatewayId: input.reference, // = custom_id
      checkoutUrl: link.data?.payment_url,
    };
  }

  extractReference(req: WebhookRequest): string | null {
    const body = (req.body ?? {}) as {
      custom_id?: string;
      data?: { custom_id?: string };
    };
    return body.custom_id ?? body.data?.custom_id ?? null;
  }

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const expected = this.config.webhookToken ?? process.env.EFI_WEBHOOK_TOKEN;
    if (!expected) throw new Error('EFI_WEBHOOK_TOKEN não configurado');
    const provided = header(req, 'efi-webhook-token');
    if (!provided || !safeEqual(provided, expected)) {
      throw new Error(INVALID_SIGNATURE);
    }

    const body = (req.body ?? {}) as {
      custom_id?: string;
      status?: string;
      data?: { custom_id?: string; status?: string; identifiers?: unknown };
    };

    const reference = body.custom_id ?? body.data?.custom_id;
    const status = body.status ?? body.data?.status;
    if (!reference || !status) return null;

    const mapped = mapEfiStatus(status);
    return {
      gatewayId: reference,
      status: mapped,
      paidAt: mapped === 'PAID' ? new Date() : undefined,
    };
  }
}
