import { NegotiationSettingRepository } from '../repositories/negotiation-setting.repository.js';
import { UpdateNegotiationSettingsDTO } from '../dtos/negotiationSettings.dto.js';
import { NegotiationRules } from '../domain/negotiation.js';
import { DEFAULT_HESITATION_OPENS } from '../domain/interaction.js';
import { PlatformSubscriptionService } from './platform-subscription.service.js';

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

/** Botão de Alívio exige plano com o recurso (spec 0020). */
export class NegotiationFeatureError extends Error {
  constructor() {
    super('PLAN_FEATURE_REQUIRED');
  }
}

export class NegotiationSettingService {
  private repository: NegotiationSettingRepository;
  private platform: PlatformSubscriptionService;

  constructor(deps?: {
    repository?: NegotiationSettingRepository;
    platform?: PlatformSubscriptionService;
  }) {
    this.repository = deps?.repository ?? new NegotiationSettingRepository();
    this.platform = deps?.platform ?? new PlatformSubscriptionService();
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
    // Botão de Alívio é recurso do plano Pro (spec 0020). Só bloqueia ao LIGAR.
    if (data.enabled) {
      const ent = await this.platform.entitlementsForCurrentTenant();
      if (!ent.features.reliefButton) throw new NegotiationFeatureError();
    }
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
