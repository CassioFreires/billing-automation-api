import { MockPaymentGateway } from './mock.gateway.js';
import { MercadoPagoGateway } from './mercadopago.gateway.js';
import { InfinitePayGateway } from './infinitepay.gateway.js';
import { PaymentGatewayProvider } from './types.js';

export * from './types.js';

/** Config de pagamento de um tenant (spec 0012). */
export interface TenantPaymentConfig {
  provider: string; // infinitepay | mercadopago | mock
  infinitepayHandle?: string | null;
  redirectUrl?: string | null;
}

/**
 * Resolve o provider a partir da configuração do TENANT (spec 0012).
 * Cada empresa recebe na própria conta, então o provider e suas credenciais
 * vêm do banco, não do .env global.
 */
export function resolvePaymentGatewayForTenant(
  config: TenantPaymentConfig
): PaymentGatewayProvider {
  switch ((config.provider ?? 'infinitepay').toLowerCase()) {
    case 'mock':
      return new MockPaymentGateway();
    case 'mercadopago':
      return new MercadoPagoGateway();
    case 'infinitepay':
      return new InfinitePayGateway({
        handle: config.infinitepayHandle ?? undefined,
        redirectUrl: config.redirectUrl ?? undefined,
      });
    default:
      console.warn(
        `⚠️ provider de pagamento '${config.provider}' não implementado. Usando 'mock'.`
      );
      return new MockPaymentGateway();
  }
}

/**
 * Resolve o provider a partir da env `PAYMENT_PROVIDER`.
 * Default: `infinitepay` (gateway padrão para comercialização). Em dev/testes,
 * defina `PAYMENT_PROVIDER=mock` para não depender de credenciais.
 * Futuro: seleção de provider por tenant (várias opções de pagamento).
 */
export function resolvePaymentGatewayFromEnv(): PaymentGatewayProvider {
  const selected = (process.env.PAYMENT_PROVIDER ?? 'infinitepay').toLowerCase();

  switch (selected) {
    case 'mock':
      return new MockPaymentGateway();
    case 'mercadopago':
      return new MercadoPagoGateway();
    case 'infinitepay':
      return new InfinitePayGateway();
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
