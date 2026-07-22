import { ReguaSettingRepository } from '../repositories/regua-setting.repository.js';
import { UpdateReguaSettingsDTO } from '../dtos/reguaSettings.dto.js';
import { ReguaStep } from '../domain/regua.js';

/** Régua desligada por padrão quando o tenant ainda não configurou (RN-2606). */
const DEFAULTS: { enabled: boolean; steps: ReguaStep[] } = { enabled: false, steps: [] };

export class ReguaSettingService {
  private repository: ReguaSettingRepository;

  constructor(deps?: { repository?: ReguaSettingRepository }) {
    this.repository = deps?.repository ?? new ReguaSettingRepository();
  }

  /** Config crua do tenant (com defaults) — para a tela e para o agendador. */
  async get(): Promise<{ enabled: boolean; steps: ReguaStep[] }> {
    const s = await this.repository.findByTenant();
    if (!s) return { ...DEFAULTS };
    return { enabled: s.enabled, steps: (s.steps as unknown as ReguaStep[]) ?? [] };
  }

  async update(data: UpdateReguaSettingsDTO) {
    return this.repository.upsert({ enabled: data.enabled, steps: data.steps });
  }
}
