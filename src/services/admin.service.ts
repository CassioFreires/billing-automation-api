import { AdminRepository } from '../repositories/admin.repository.js';
import { AuthService } from './auth.service.js';
import { PLANS, PlanId, isPlanId, nextPeriodEnd, resolveEntitlements } from '../domain/plans.js';

/** Erros de domínio do painel admin (mapeados p/ HTTP no controller). */
export class AdminError extends Error {
  constructor(public code: 'INVALID_PLAN' | 'NOT_FOUND') {
    super(code);
  }
}

export class AdminService {
  private repo: AdminRepository;
  private auth: AuthService;

  constructor(deps?: { repo?: AdminRepository; auth?: AuthService }) {
    this.repo = deps?.repo ?? new AdminRepository();
    this.auth = deps?.auth ?? new AuthService();
  }

  /** Métricas de negócio: MRR, contagem por status, trials expirando. */
  async getMetrics(now: Date = new Date()) {
    const subs = await this.repo.allSubscriptions();
    const soon = new Date(now.getTime() + 7 * 86400000);

    let mrrCents = 0;
    const byStatus: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0 };
    let trialsExpiringSoon = 0;

    for (const s of subs) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      // MRR = soma dos planos PAGOS ativos e vigentes.
      if (s.status === 'active' && isPlanId(s.plan) && PLANS[s.plan].priceCents > 0) {
        if (!s.currentPeriodEnd || s.currentPeriodEnd > now) {
          mrrCents += PLANS[s.plan].priceCents;
        }
      }
      if (s.status === 'trialing' && s.trialEndsAt && s.trialEndsAt > now && s.trialEndsAt <= soon) {
        trialsExpiringSoon++;
      }
    }

    return {
      totalTenants: subs.length,
      byStatus,
      mrrCents,
      trialsExpiringSoon,
    };
  }

  async listTenants(params: { search?: string; page?: number }, now: Date = new Date()) {
    const { rows, total, page, limit } = await this.repo.listTenants(params);
    const tenants = rows.map((a: any) => {
      const sub = a.platformSubscription;
      const ent = resolveEntitlements(sub ?? null, now, a.status);
      return {
        id: a.id,
        name: a.name,
        accountStatus: a.status,
        createdAt: a.createdAt,
        plan: sub?.plan ?? 'free',
        status: sub?.status ?? 'trialing',
        trialEndsAt: sub?.trialEndsAt ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        canWrite: ent.canWrite,
        counts: a._count,
      };
    });
    return { tenants, total, page, limit };
  }

  async getTenant(id: string) {
    const a = await this.repo.getTenant(id);
    if (!a) throw new AdminError('NOT_FOUND');
    return a;
  }

  async suspend(adminEmail: string, tenantId: string) {
    const acc = await this.repo.setAccountStatus(tenantId, 'SUSPENDED');
    await this.repo.createAudit({ adminEmail, action: 'suspend', targetTenantId: tenantId });
    return acc;
  }

  async activate(adminEmail: string, tenantId: string) {
    const acc = await this.repo.setAccountStatus(tenantId, 'ACTIVE');
    await this.repo.createAudit({ adminEmail, action: 'activate', targetTenantId: tenantId });
    return acc;
  }

  /** Troca de plano forçada (comp/suporte). Pago → ativa +1 mês; free → sem período. */
  async changePlan(adminEmail: string, tenantId: string, planRaw: string, now: Date = new Date()) {
    if (!isPlanId(planRaw)) throw new AdminError('INVALID_PLAN');
    const plan: PlanId = planRaw;
    const paid = PLANS[plan].priceCents > 0;
    const sub = await this.repo.overrideSubscription(tenantId, {
      plan,
      status: 'active',
      currentPeriodEnd: paid ? nextPeriodEnd(now) : null,
    });
    await this.repo.createAudit({
      adminEmail,
      action: 'change_plan',
      targetTenantId: tenantId,
      meta: { plan },
    });
    return sub;
  }

  /** Impersona o tenant (token curto) + auditoria. */
  async impersonate(adminEmail: string, tenantId: string) {
    const token = await this.auth.issueImpersonation(adminEmail, tenantId);
    await this.repo.createAudit({ adminEmail, action: 'impersonate', targetTenantId: tenantId });
    return token;
  }
}
