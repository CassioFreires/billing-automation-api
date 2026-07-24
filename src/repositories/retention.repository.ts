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

  /**
   * Resolve o pedido (idempotente): aplica o efeito concreto na assinatura e grava
   * o desfecho. `cancelled` → CANCELED; `saved`+`pause` → PAUSED; `saved`+`discount`
   * → grava desconto ativo (percent/until) na assinatura; demais ofertas só registram.
   */
  async resolve(
    id: string,
    params: {
      outcome: 'saved' | 'cancelled';
      offer: string | null;
      subscriptionId: string;
      discountPercent?: number | null;
      discountUntil?: Date | null;
    }
  ) {
    const now = new Date();
    const { outcome, offer, subscriptionId } = params;

    return prisma.$transaction(async (tx) => {
      if (outcome === 'cancelled') {
        await tx.subscription.update({ where: { id: subscriptionId }, data: { status: 'CANCELED' } });
      } else if (offer === 'pause') {
        await tx.subscription.update({ where: { id: subscriptionId }, data: { status: 'PAUSED' } });
      } else if (offer === 'discount' && params.discountPercent && params.discountUntil) {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { discountPercent: params.discountPercent, discountUntil: params.discountUntil },
        });
      }

      return tx.cancellationRequest.update({
        where: { id },
        data: {
          status: outcome,
          saveOffer: outcome === 'saved' ? offer : null,
          appliedPercent: outcome === 'saved' && offer === 'discount' ? params.discountPercent ?? null : null,
          appliedUntil: outcome === 'saved' && offer === 'discount' ? params.discountUntil ?? null : null,
          resolvedAt: now,
        },
      });
    });
  }

  // ── Config de retenção por tenant (spec 0038) ──────────────────────────────

  /** Config do tenant; defaults quando ainda não existe (não cria). */
  async getSettings() {
    const tenantId = requireTenantId();
    const s = await prisma.retentionSetting.findUnique({ where: { tenantId } });
    return {
      discountPercent: s?.discountPercent ?? 30,
      discountDurationMonths: s?.discountDurationMonths ?? 2,
      discountEnabled: s?.discountEnabled ?? true,
      pauseEnabled: s?.pauseEnabled ?? true,
    };
  }

  async upsertSettings(data: {
    discountPercent?: number;
    discountDurationMonths?: number;
    discountEnabled?: boolean;
    pauseEnabled?: boolean;
  }) {
    const tenantId = requireTenantId();
    const saved = await prisma.retentionSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data },
    });
    return {
      discountPercent: saved.discountPercent,
      discountDurationMonths: saved.discountDurationMonths,
      discountEnabled: saved.discountEnabled,
      pauseEnabled: saved.pauseEnabled,
    };
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
