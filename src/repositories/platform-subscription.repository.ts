import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Acesso à assinatura de PLATAFORMA (spec 0020). Alguns métodos são
 * tenant-scoped (tela do dono) e outros GLOBAIS (webhook/cron sem contexto de
 * tenant — entrada legítima como findByGatewayId/findByLinkToken).
 */
export class PlatformSubscriptionRepository {
  /** Assinatura do tenant atual (tela de plano). */
  async findByTenant() {
    return prisma.platformSubscription.findUnique({ where: { tenantId: requireTenantId() } });
  }

  /** Assinatura de um tenant específico (webhook/cron, sem contexto). */
  async findByTenantId(tenantId: string) {
    return prisma.platformSubscription.findUnique({ where: { tenantId } });
  }

  /** Atualiza plano/status/período de um tenant (webhook/cron). */
  async update(
    tenantId: string,
    data: { plan?: string; status?: string; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null }
  ) {
    return prisma.platformSubscription.update({ where: { tenantId }, data });
  }

  /**
   * Varredura do cron (GLOBAL): trials vencidos e assinaturas pagas com período
   * vencido — candidatos a expirar/renovar.
   */
  async findDueForRenewal(now: Date) {
    return prisma.platformSubscription.findMany({
      where: {
        OR: [
          { status: 'trialing', trialEndsAt: { lte: now } },
          { status: 'active', plan: { not: 'free' }, currentPeriodEnd: { lte: now } },
        ],
      },
    });
  }
}
