import { PaymentSettingRepository } from '../repositories/payment-setting.repository.js';
import { UpdatePaymentSettingsDTO } from '../dtos/paymentSettings.dto.js';
import { TenantPaymentConfig } from '../apis/payment/index.js';

/** Provider default quando o tenant ainda não configurou. */
const DEFAULT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'infinitepay';

/** Campos secretos que a API expõe apenas como "está setado?" (nunca o valor). */
const SECRET_FIELDS = [
  'apiKey',
  'token',
  'clientId',
  'clientSecret',
  'certificateBase64',
  'secretKey',
  'webhookSecret',
  'webhookToken',
  'accessToken',
] as const;

export class PaymentSettingService {
  private repository: PaymentSettingRepository;

  constructor(deps?: { repository?: PaymentSettingRepository }) {
    this.repository = deps?.repository ?? new PaymentSettingRepository();
  }

  /**
   * Config do tenant atual para RESOLVER o gateway (inclui credenciais
   * decifradas). Sem config salva, cai no provider default.
   */
  async getForCurrentTenant(): Promise<TenantPaymentConfig> {
    const settings = await this.repository.findByTenant();
    if (!settings) {
      return { provider: DEFAULT_PROVIDER };
    }
    return {
      provider: settings.provider,
      infinitepayHandle: settings.infinitepayHandle,
      redirectUrl: settings.redirectUrl,
      credentials: settings.credentials,
    };
  }

  /**
   * Config MASCARADA para a tela de Configurações: nunca devolve segredos, só
   * `credentialStatus` (quais estão setados) — espelha o `hasToken` do WhatsApp.
   */
  async get() {
    const settings = await this.repository.findByTenant();
    const credentials = settings?.credentials ?? {};
    const credentialStatus = Object.fromEntries(
      SECRET_FIELDS.map((f) => [f, Boolean(credentials[f])])
    );
    return {
      provider: settings?.provider ?? DEFAULT_PROVIDER,
      infinitepayHandle: settings?.infinitepayHandle ?? null,
      redirectUrl: settings?.redirectUrl ?? null,
      credentialStatus,
    };
  }

  async update(data: UpdatePaymentSettingsDTO) {
    await this.repository.upsert({
      provider: data.provider,
      infinitepayHandle: data.infinitepayHandle ?? null,
      redirectUrl: data.redirectUrl ?? null,
      credentials: data.credentials,
    });
    return this.get();
  }
}
