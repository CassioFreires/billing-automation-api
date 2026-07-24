import { CockpitRepository } from '../repositories/cockpit.repository.js';
import { rankDailyActions, DEFAULT_ACTION_LIMIT } from '../domain/action-queue.js';

/**
 * Lista do Dia (spec 0036, F3): monta a fila de ação priorizada por dinheiro em
 * risco, unindo faturas em aberto + saúde do cliente (F2) + caso de recuperação
 * (F1). Só leitura; o ranking é domínio puro (`rankDailyActions`). Escopo por tenant.
 */
export class ActionQueueService {
  private repo: CockpitRepository;

  constructor(deps?: { repo?: CockpitRepository }) {
    this.repo = deps?.repo ?? new CockpitRepository();
  }

  async getForTenant(now: Date = new Date(), limit: number = DEFAULT_ACTION_LIMIT) {
    const candidates = await this.repo.findActionCandidates();
    const ranked = rankDailyActions(candidates, now, limit);
    return {
      geradoEm: now,
      total: ranked.total,
      mostrando: ranked.mostrando,
      itens: ranked.itens,
    };
  }
}
