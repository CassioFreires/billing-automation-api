import { NegotiationSettingRepository } from '../repositories/negotiation-setting.repository.js';
import { UpdateNegotiationSettingsDTO } from '../dtos/negotiationSettings.dto.js';
import { NegotiationRules } from '../domain/negotiation.js';
import { DEFAULT_HESITATION_OPENS } from '../domain/interaction.js';

/** Regras default quando o tenant ainda não configurou (alívio DESLIGADO). */
const DEFAULTS = {
  enabled: false,
  hesitationOpens: DEFAULT_HESITATION_OPENS,
  discountEnabled: false,
  discountPercent: 0,
  installmentsEnabled: false,
  maxInstallments: 1,
  deferEnabled: false,
  deferMaxDays: 0,
  deferFeePercent: 0,
};

export class NegotiationSettingService {
  private repository: NegotiationSettingRepository;

  constructor(deps?: { repository?: NegotiationSettingRepository }) {
    this.repository = deps?.repository ?? new NegotiationSettingRepository();
  }

  /** Config "crua" do tenant (com defaults) — para a tela de Configurações. */
  async get() {
    const s = await this.repository.findByTenant();
    if (!s) return { ...DEFAULTS };
    return {
      enabled: s.enabled,
      hesitationOpens: s.hesitationOpens,
      discountEnabled: s.discountEnabled,
      discountPercent: Number(s.discountPercent),
      installmentsEnabled: s.installmentsEnabled,
      maxInstallments: s.maxInstallments,
      deferEnabled: s.deferEnabled,
      deferMaxDays: s.deferMaxDays,
      deferFeePercent: Number(s.deferFeePercent),
    };
  }

  /** Regras no formato consumido pelo domínio puro (negotiation.ts). */
  async getRules(): Promise<NegotiationRules> {
    return this.get();
  }

  async update(data: UpdateNegotiationSettingsDTO) {
    return this.repository.upsert({
      enabled: data.enabled,
      hesitationOpens: data.hesitationOpens,
      discountEnabled: data.discountEnabled,
      discountPercent: data.discountPercent,
      installmentsEnabled: data.installmentsEnabled,
      maxInstallments: data.maxInstallments,
      deferEnabled: data.deferEnabled,
      deferMaxDays: data.deferMaxDays,
      deferFeePercent: data.deferFeePercent,
    });
  }
}
