import { ForecastRepository } from '../repositories/forecast.repository.js';
import { projectCashflow } from '../domain/cashflow.js';

const DAY_MS = 86_400_000;

/**
 * Previsão de Caixa (spec 0039, F4). Reúne os inputs (faturas + assinaturas + saúde)
 * e projeta a entrada de caixa da janela em baldes semanais (domínio puro). Escopo
 * por tenant, só leitura.
 */
export class ForecastService {
  private repo: ForecastRepository;

  constructor(deps?: { repo?: ForecastRepository }) {
    this.repo = deps?.repo ?? new ForecastRepository();
  }

  async getForTenant(now: Date = new Date(), days = 30) {
    const until = new Date(now.getTime() + days * DAY_MS);
    const items = await this.repo.findInputs(now, until);
    const forecast = projectCashflow(items, now, days);
    return { geradoEm: now, dias: days, ...forecast };
  }
}
