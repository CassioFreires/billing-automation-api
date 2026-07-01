export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'FAILED';

export interface CreateChargeInput {
  /** Referência interna única usada como localizador (external_reference). */
  reference: string;
  amount: number;
  dueDate: Date;
  description?: string;
  payerEmail?: string;
}

export interface ChargeResult {
  /** Identificador que localiza a fatura no webhook (RN-P2). */
  gatewayId: string;
  /** URL de checkout hospedado (Checkout Pro). */
  checkoutUrl?: string;
  /** PIX copia-e-cola / QR (quando o provider os fornece direto). */
  pixCopyPaste?: string;
  pixQrCode?: string;
}

/** Entrada mínima de um webhook, agnóstica de framework. */
export interface WebhookRequest {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

export interface WebhookResult {
  /** Id do evento para idempotência (RN-P3). */
  eventId?: string;
  /** Localizador da fatura (gatewayId). */
  gatewayId: string;
  status: InvoiceStatus;
  paidAt?: Date;
}

export interface PaymentGatewayProvider {
  readonly name: string;

  /** Cria a cobrança e devolve os dados de pagamento. */
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;

  /**
   * Verifica a autenticidade do webhook e normaliza o evento (RN-P4).
   * Retorna `null` quando o evento deve ser ignorado; lança em assinatura inválida.
   */
  verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookResult | null>;
}
