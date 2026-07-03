import { WhatsappSettingRepository } from '../repositories/whatsapp-setting.repository.js';
import { UpdateWhatsappSettingsDTO } from '../dtos/whatsappSettings.dto.js';
import { TenantWhatsappConfig } from '../apis/whatsapp.api.js';

export class WhatsappSettingService {
  private repository: WhatsappSettingRepository;

  constructor(deps?: { repository?: WhatsappSettingRepository }) {
    this.repository = deps?.repository ?? new WhatsappSettingRepository();
  }

  /**
   * Config do tenant atual para o WORKER (inclui o token). Sem config salva,
   * cai no provider global do .env (compat) via 'log' por padrão.
   */
  async getForCurrentTenant(): Promise<TenantWhatsappConfig> {
    const s = await this.repository.findByTenant();
    if (!s) {
      return { provider: process.env.WHATSAPP_PROVIDER ?? 'log' };
    }
    return {
      provider: s.provider,
      token: s.token,
      phoneNumberId: s.phoneNumberId,
      apiVersion: s.apiVersion,
    };
  }

  /** Versão MASCARADA para a API/tela: nunca devolve o token (só se está setado). */
  async getMasked() {
    const s = await this.repository.findByTenant();
    return {
      provider: s?.provider ?? 'log',
      phoneNumberId: s?.phoneNumberId ?? null,
      apiVersion: s?.apiVersion ?? null,
      hasToken: Boolean(s?.token),
    };
  }

  async update(data: UpdateWhatsappSettingsDTO) {
    await this.repository.upsert({
      provider: data.provider,
      phoneNumberId: data.phoneNumberId ?? null,
      token: data.token, // undefined = mantém o salvo; string = atualiza
      apiVersion: data.apiVersion ?? null,
    });
    return this.getMasked();
  }
}
