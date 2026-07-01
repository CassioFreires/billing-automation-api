import { MockPaymentGateway } from './mock.gateway.js';
import { MercadoPagoGateway } from './mercadopago.gateway.js';
import { PaymentGatewayProvider } from './types.js';

export * from './types.js';

/**
 * Resolve o provider a partir da env `PAYMENT_PROVIDER`.
 * Default: `mock` (comportamento atual, sem gateway real).
 */
export function resolvePaymentGatewayFromEnv(): PaymentGatewayProvider {
  const selected = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();

  switch (selected) {
    case 'mock':
      return new MockPaymentGateway();
    case 'mercadopago':
      return new MercadoPagoGateway();
    default:
      console.warn(
        `⚠️ PAYMENT_PROVIDER='${selected}' não implementado. Usando 'mock' como fallback.`
      );
      return new MockPaymentGateway();
  }
}

/** Fachada usada pela aplicação; injeta o provider ativo. */
export class PaymentGatewayAPI {
  private readonly provider: PaymentGatewayProvider;

  constructor(provider?: PaymentGatewayProvider) {
    this.provider = provider ?? resolvePaymentGatewayFromEnv();
  }

  get name(): string {
    return this.provider.name;
  }

  createCharge(input: Parameters<PaymentGatewayProvider['createCharge']>[0]) {
    return this.provider.createCharge(input);
  }

  verifyAndParseWebhook(req: Parameters<PaymentGatewayProvider['verifyAndParseWebhook']>[0]) {
    return this.provider.verifyAndParseWebhook(req);
  }
}
