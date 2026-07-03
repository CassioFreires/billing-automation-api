import {
  ChargeResult,
  CreateChargeInput,
  InvoiceStatus,
  PaymentGatewayProvider,
  WebhookRequest,
  WebhookResult,
} from './types.js';

/**
 * Integração com o InfinitePay via Checkout (link de pagamento).
 *
 * Diferente do Mercado Pago, o InfinitePay gera o checkout por um LINK baseado
 * no "handle" do lojista — sem precisar de token para criar a cobrança. O link
 * hospedado oferece PIX e cartão. A referência interna vai em `order_nsu`
 * (external_order_nsu), que é o nosso localizador (gatewayId) na confirmação.
 *
 * ⚠️ CONFIRMAÇÃO (verifyAndParseWebhook): o contrato exato de webhook do
 * InfinitePay precisa ser validado com a documentação da conta. O que está
 * aqui segue o padrão "confirma no servidor via payment_check" e deve ser
 * ajustado quando tivermos a doc oficial (nomes de campos/endpoint).
 */

function requireHandle(): string {
  const handle = process.env.INFINITEPAY_HANDLE;
  if (!handle) throw new Error('INFINITEPAY_HANDLE não configurado');
  return handle;
}

function checkoutBaseUrl(): string {
  return process.env.INFINITEPAY_CHECKOUT_URL ?? 'https://checkout.infinitepay.io';
}

function apiBaseUrl(): string {
  return process.env.INFINITEPAY_API_URL ?? 'https://api.infinitepay.io';
}

export class InfinitePayGateway implements PaymentGatewayProvider {
  readonly name = 'infinitepay';

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const handle = requireHandle();

    // InfinitePay trabalha com valores em CENTAVOS (inteiro).
    const priceInCents = Math.round(input.amount * 100);

    const items = [
      {
        name: input.description ?? 'Cobrança',
        price: priceInCents,
        quantity: 1,
      },
    ];

    const params = new URLSearchParams({
      items: JSON.stringify(items),
      order_nsu: input.reference, // nossa referência = localizador na confirmação
    });

    const redirectUrl = process.env.INFINITEPAY_REDIRECT_URL;
    if (redirectUrl) {
      params.set('redirect_url', redirectUrl);
    }

    const checkoutUrl = `${checkoutBaseUrl()}/${handle}?${params.toString()}`;

    return {
      // Usamos a própria referência como gatewayId: o InfinitePay a devolve
      // como external_order_nsu na confirmação, casando com findByGatewayId.
      gatewayId: input.reference,
      checkoutUrl,
    };
  }

  /**
   * Confirma o pagamento de forma idempotente.
   *
   * ⚠️ A VALIDAR com a doc do InfinitePay. Estratégia (padrão do provider):
   * o webhook/redirect traz `transaction_nsu`, `external_order_nsu` (= nossa
   * referência) e `slug`; consultamos o payment_check no servidor para NÃO
   * confiar cegamente no payload. Ajustar campos/endpoint conforme a doc.
   */
  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = req.query ?? {};

    const pick = (key: string): string | undefined => {
      const fromBody = body[key];
      if (typeof fromBody === 'string') return fromBody;
      const fromQuery = query[key];
      if (typeof fromQuery === 'string') return fromQuery;
      return undefined;
    };

    const externalOrderNsu = pick('external_order_nsu') ?? pick('order_nsu');
    const transactionNsu = pick('transaction_nsu');
    const slug = pick('slug');

    // Sem a referência não há como localizar a fatura.
    if (!externalOrderNsu) return null;

    const paid = await this.confirmPayment({
      handle: requireHandle(),
      transactionNsu,
      externalOrderNsu,
      slug,
    });

    if (paid === null) return null; // não deu para confirmar → ignora (não marca pago)

    const status: InvoiceStatus = paid ? 'PAID' : 'PENDING';

    return {
      eventId: transactionNsu, // idempotência por transação
      gatewayId: externalOrderNsu,
      status,
      paidAt: paid ? new Date() : undefined,
    };
  }

  /**
   * Consulta o InfinitePay para confirmar se a transação foi paga.
   * Retorna true/false, ou null quando não foi possível consultar.
   * ⚠️ Endpoint/campos a validar com a doc oficial.
   */
  private async confirmPayment(args: {
    handle: string;
    transactionNsu?: string;
    externalOrderNsu: string;
    slug?: string;
  }): Promise<boolean | null> {
    try {
      const params = new URLSearchParams({ external_order_nsu: args.externalOrderNsu });
      if (args.transactionNsu) params.set('transaction_nsu', args.transactionNsu);
      if (args.slug) params.set('slug', args.slug);

      const url = `${apiBaseUrl()}/invoices/public/checkout/payment_check/${args.handle}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = (await res.json()) as { success?: boolean; paid?: boolean };
      return Boolean(data.paid ?? data.success);
    } catch {
      return null;
    }
  }
}
