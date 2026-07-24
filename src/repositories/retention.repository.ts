import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Retenção no cancelamento (spec 0037, F11). Persiste o pedido de cancelamento e
 * seu desfecho; lê a assinatura com a saúde do cliente (F2) para recomendar a
 * oferta. Tudo escopado por tenant (RN-3705).
 */
export class RetentionRepository {
  /** Assinatura do tenant + faixa de saúde do cliente (para decidir a oferta). */
  async findSubscriptionWithHealth(subscriptionId: string) {
    const tenantId = requireTenantId();
    const sub = await prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: {
        id: true,
        status: true,
        clientId: true,
        client: { select: { name: true, health: { select: { band: true } } } },
      },
    });
    if (!sub) return null;
    return {
      id: sub.id,
      status: sub.status,
      clientId: sub.clientId,
      clientName: sub.client?.name ?? '—',
      healthBand: sub.client?.health?.band ?? null,
      tenantId,
    };
  }

  async createRequest(data: {
    subscriptionId: string;
    clientId: string;
    tenantId: string;
    reason: string | null;
    recommended: string;
  }) {
    return prisma.cancellationRequest.create({
      data: {
        subscriptionId: data.subscriptionId,
        clientId: data.clientId,
        tenantId: data.tenantId,
        reason: data.reason,
        recommended: data.recommended,
        status: 'open',
      },
    });
  }

  async findByIdForTenant(id: string) {
    return prisma.cancellationRequest.findFirst({
      where: { id, tenantId: requireTenantId() },
    });
  }

  /** Resolve o pedido: pausa/cancela a assinatura e grava o desfecho (idempotente). */
  async resolve(
    id: string,
    outcome: 'saved' | 'cancelled',
    appliedOffer: string | null,
    subscriptionId: string
  ) {
    const now = new Date();
    const subStatus = outcome === 'cancelled' ? 'CANCELED' : appliedOffer === 'pause' ? 'PAUSED' : null;

    return prisma.$transaction(async (tx) => {
      if (subStatus) {
        await tx.subscription.update({ where: { id: subscriptionId }, data: { status: subStatus } });
      }
      return tx.cancellationRequest.update({
        where: { id },
        data: { status: outcome, saveOffer: outcome === 'saved' ? appliedOffer : null, resolvedAt: now },
      });
    });
  }

  /** Lista os pedidos do tenant (painel de retenção). */
  async listForTenant() {
    const tenantId = requireTenantId();
    const rows = await prisma.cancellationRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      clientName: r.client?.name ?? '—',
      subscriptionId: r.subscriptionId,
      reason: r.reason,
      status: r.status,
      recommended: r.recommended,
      saveOffer: r.saveOffer,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    }));
  }
}
