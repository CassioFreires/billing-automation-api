import { PaymentSettingRepository } from '../repositories/payment-setting.repository.js';
import { UpdatePaymentSettingsDTO } from '../dtos/paymentSettings.dto.js';
import { TenantPaymentConfig } from '../apis/payment/index.js';

/** Provider default quando o tenant ainda não configurou. */
const DEFAULT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'infinitepay';

export class PaymentSettingService {
  private repository: PaymentSettingRepository;

  constructor(deps?: { repository?: PaymentSettingRepository }) {
    this.repository = deps?.repository ?? new PaymentSettingRepository();
  }

  /** Config do tenant atual (ou default quando ainda não configurada). */
  async getForCurrentTenant(): Promise<TenantPaymentConfig> {
    const settings = await this.repository.findByTenant();
    if (!settings) {
      return { provider: DEFAULT_PROVIDER };
    }
    return {
      provider: settings.provider,
      infinitepayHandle: settings.infinitepayHandle,
      redirectUrl: settings.redirectUrl,
    };
  }

  /** Retorna a config "crua" para a tela de Configurações. */
  async get() {
    const settings = await this.repository.findByTenant();
    return (
      settings ?? {
        provider: DEFAULT_PROVIDER,
        infinitepayHandle: null,
        redirectUrl: null,
      }
    );
  }

  async update(data: UpdatePaymentSettingsDTO) {
    return this.repository.upsert({
      provider: data.provider,
      infinitepayHandle: data.infinitepayHandle ?? null,
      redirectUrl: data.redirectUrl ?? null,
    });
  }
}
