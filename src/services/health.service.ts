import { AccountRepository } from '../repositories/account.repository.js';
import { ClientHealthRepository } from '../repositories/client-health.repository.js';
import { runWithTenant, requireTenantId } from '../context/tenant-context.js';
import { computeHealth } from '../domain/health-score.js';

export interface HealthRunResult {
  tenants: number;
  updated: number; // clientes recalculados
}

/**
 * Radar de Risco (spec 0035, F2). Calcula o score de saúde de cada cliente por
 * regras (`computeHealth`, domínio puro) a partir dos sinais agregados no
 * repositório. Recalcula (a) por cliente em evento de pagamento e (b) no sweep
 * diário — pendurado no mesmo cron do F1, DEPOIS da recuperação (o desfecho
 * `lost` do dia já entra no score). Score é interno do tenant (RN-3507).
 */
export class HealthService {
  private accounts: AccountRepository;
  private repo: ClientHealthRepository;

  constructor(deps?: { accounts?: AccountRepository; repo?: ClientHealthRepository }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.repo = deps?.repo ?? new ClientHealthRepository();
  }

  /** Sweep cross-tenant: recalcula todos os clientes de todos os tenants ativos. */
  async runAllTenants(now: Date = new Date()): Promise<HealthRunResult> {
    const tenantIds = await this.accounts.findActiveTenantIds();
    let updated = 0;
    for (const tenantId of tenantIds) {
      updated += await runWithTenant(tenantId, () => this.recomputeAllForTenant(now));
    }
    return { tenants: tenantIds.length, updated };
  }

  /** Recalcula todos os clientes do tenant ATUAL. Retorna quantos foram gravados. */
  async recomputeAllForTenant(now: Date = new Date()): Promise<number> {
    const tenantId = requireTenantId();
    const inputs = await this.repo.aggregateInputs(now);
    for (const { clientId, input } of inputs) {
      const r = computeHealth(input, now);
      await this.repo.upsert(clientId, tenantId, { score: r.score, band: r.band, signals: r.signals });
    }
    return inputs.length;
  }

  /**
   * Recalcula UM cliente (chamado no evento de pagamento). Recebe o `tenantId`
   * explícito e roda no contexto dele — funciona mesmo a partir do webhook
   * (cross-tenant). Best-effort no chamador: nunca deve derrubar o pagamento.
   */
  async recomputeForClient(clientId: string, tenantId: string, now: Date = new Date()): Promise<void> {
    await runWithTenant(tenantId, async () => {
      const inputs = await this.repo.aggregateInputs(now, clientId);
      for (const { clientId: cid, input } of inputs) {
        const r = computeHealth(input, now);
        await this.repo.upsert(cid, tenantId, { score: r.score, band: r.band, signals: r.signals });
      }
    });
  }
}
