import { AccountRepository } from '../repositories/account.repository.js';
import { SubscriptionService, RunResult } from './subscription.service.js';
import { publishRabbitMql } from '../messaging/publish/publish.messaging.js';
import { BILLING_QUEUE } from '../messaging/billing-scheduler-queue.js';
import { runWithTenant } from '../context/tenant-context.js';

/** Mensagem enfileirada por tenant: "gere a cobrança recorrente deste tenant". */
export interface BillingJob {
  tenantId: string;
}

/**
 * Agendador de cobrança recorrente cross-tenant (spec 0010).
 *
 * `enqueueAllTenants` NÃO gera faturas — só faz o fan-out: lista os tenants
 * ativos e publica um job por tenant na fila. O trabalho pesado (gerar as
 * faturas) roda no worker, um tenant por vez, via `processTenant`. Assim um
 * único disparo diário cobre todas as empresas, e escala adicionando workers.
 */
export class BillingSchedulerService {
  private accounts: AccountRepository;
  private subscriptions: SubscriptionService;

  constructor(deps?: {
    accounts?: AccountRepository;
    subscriptions?: SubscriptionService;
  }) {
    this.accounts = deps?.accounts ?? new AccountRepository();
    this.subscriptions = deps?.subscriptions ?? new SubscriptionService();
  }

  /** Fan-out: enfileira um job de cobrança por tenant ativo. Retorna quantos. */
  async enqueueAllTenants(): Promise<{ enfileirados: number }> {
    const tenantIds = await this.accounts.findActiveTenantIds();

    for (const tenantId of tenantIds) {
      const job: BillingJob = { tenantId };
      await publishRabbitMql(BILLING_QUEUE, JSON.stringify(job));
    }

    return { enfileirados: tenantIds.length };
  }

  /**
   * Processa a cobrança recorrente de UM tenant (chamado pelo worker).
   * Roda dentro do contexto do tenant para o isolamento valer nas queries.
   */
  async processTenant(tenantId: string, now: Date = new Date()): Promise<RunResult> {
    return runWithTenant(tenantId, () => this.subscriptions.run(now));
  }
}
