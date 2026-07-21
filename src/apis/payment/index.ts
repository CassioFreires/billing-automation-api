import { MockPaymentGateway } from './mock.gateway.js';
import { MercadoPagoGateway } from './mercadopago.gateway.js';
import { InfinitePayGateway } from './infinitepay.gateway.js';
import { AsaasGateway } from './asaas.gateway.js';
import { PagBankGateway } from './pagbank.gateway.js';
import { EfiGateway } from './efi.gateway.js';
import { StripeGateway } from './stripe.gateway.js';
import { PagarmeGateway } from './pagarme.gateway.js';
import { PaymentGatewayProvider } from './types.js';

export * from './types.js';

/** Providers suportados (spec 0019). */
export const PAYMENT_PROVIDERS = [
  'infinitepay',
  'mercadopago',
  'mock',
  'asaas',
  'pagbank',
  'efi',
  'stripe',
  'pagarme',
] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/**
 * Config de pagamento de um tenant (spec 0012 + 0019). `credentials` traz os
 * segredos JÁ DECIFRADOS (o service decifra `credentialsEnc` antes de resolver).
 */
export interface TenantPaymentConfig {
  provider: string;
  infinitepayHandle?: string | null;
  redirectUrl?: string | null;
  credentials?: Record<string, unknown> | null;
}

function creds(config: TenantPaymentConfig): Record<string, unknown> {
  return config.credentials ?? {};
}

/**
 * Resolve o provider a partir da configuração do TENANT (spec 0012 + 0019).
 * Cada empresa escolhe o gateway que já usa; provider + credenciais vêm do
 * banco (segredos decifrados), não do .env global.
 */
export function resolvePaymentGatewayForTenant(
  config: TenantPaymentConfig
): PaymentGatewayProvider {
  const c = creds(config);
  switch ((config.provider ?? 'infinitepay').toLowerCase()) {
    case 'mock':
      return new MockPaymentGateway();
    case 'mercadopago':
      return new MercadoPagoGateway({
        accessToken: c.accessToken as string | undefined,
        webhookSecret: c.webhookSecret as string | undefined,
      });
    case 'infinitepay':
      return new InfinitePayGateway({
        handle: config.infinitepayHandle ?? undefined,
        redirectUrl: config.redirectUrl ?? undefined,
      });
    case 'asaas':
      return new AsaasGateway({
        apiKey: c.apiKey as string | undefined,
        webhookToken: c.webhookToken as string | undefined,
      });
    case 'pagbank':
      return new PagBankGateway({
        token: c.token as string | undefined,
        redirectUrl: config.redirectUrl ?? undefined,
      });
    case 'efi':
      return new EfiGateway({
        clientId: c.clientId as string | undefined,
        clientSecret: c.clientSecret as string | undefined,
        certificateBase64: c.certificateBase64 as string | undefined,
        webhookToken: c.webhookToken as string | undefined,
      });
    case 'stripe':
      return new StripeGateway({
        secretKey: c.secretKey as string | undefined,
        webhookSecret: c.webhookSecret as string | undefined,
        successUrl: config.redirectUrl ?? undefined,
      });
    case 'pagarme':
      return new PagarmeGateway({
        secretKey: c.secretKey as string | undefined,
        webhookSecret: c.webhookSecret as string | undefined,
        successUrl: config.redirectUrl ?? undefined,
      });
    default:
      console.warn(
        `⚠️ provider de pagamento '${config.provider}' não implementado. Usando 'mock'.`
      );
      return new MockPaymentGateway();
  }
}

/**
 * Resolve um provider APENAS pelo nome (spec 0019, webhook por provider).
 * Sem credenciais de tenant — usa as envs de cada provider como fallback.
 * O controller de webhook, ao localizar o tenant pela referência, prefere
 * `resolvePaymentGatewayForTenant` com as credenciais decifradas.
 */
export function resolvePaymentGatewayByName(name: string): PaymentGatewayProvider {
  return resolvePaymentGatewayForTenant({ provider: name });
}

/**
 * Resolve o provider a partir da env `PAYMENT_PROVIDER`.
 * Default: `infinitepay`. Em dev/testes, defina `PAYMENT_PROVIDER=mock`.
 */
export function resolvePaymentGatewayFromEnv(): PaymentGatewayProvider {
  const selected = (process.env.PAYMENT_PROVIDER ?? 'infinitepay').toLowerCase();
  return resolvePaymentGatewayForTenant({ provider: selected });
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
