import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

export interface ReferralSettingsView {
  enabled: boolean;
  rewardCents: number;
  rewardWho: string;
}

/**
 * Indique e Ganhe (spec 0046, F16). Config + código por cliente + indicações +
 * crédito acumulado. `findByReferralCode` é a ÚNICA leitura cross-tenant (o amigo
 * indicado não tem sessão) — resolve o tenant pelo código, sem `requireTenantId()`.
 */
export class ReferralRepository {
  async getSettings(): Promise<ReferralSettingsView> {
    const s = await prisma.referralSetting.findUnique({ where: { tenantId: requireTenantId() } });
    return {
      enabled: s?.enabled ?? false,
      rewardCents: s?.rewardCents ?? 1000,
      rewardWho: s?.rewardWho ?? 'both',
    };
  }

  async upsertSettings(data: { enabled?: boolean; rewardCents?: number; rewardWho?: string }) {
    const tenantId = requireTenantId();
    const s = await prisma.referralSetting.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: { ...data } });
    return { enabled: s.enabled, rewardCents: s.rewardCents, rewardWho: s.rewardWho };
  }

  /** Resolve tenant + indicador a partir do código (cross-tenant, sem contexto). */
  async findByReferralCode(code: string) {
    return prisma.client.findFirst({
      where: { referralCode: code },
      select: { id: true, name: true, tenantId: true },
    });
  }

  async getClientCode(clientId: string): Promise<string | null> {
    const c = await prisma.client.findFirst({ where: { id: clientId, tenantId: requireTenantId() }, select: { referralCode: true } });
    return c?.referralCode ?? null;
  }

  async setClientCode(clientId: string, code: string) {
    await prisma.client.updateMany({ where: { id: clientId, tenantId: requireTenantId() }, data: { referralCode: code } });
  }

  async findClientByPhone(phone: string) {
    return prisma.client.findFirst({ where: { tenantId: requireTenantId(), phone }, select: { id: true } });
  }

  /** Cria o cliente indicado (lead) atribuído ao indicador. Escopo por tenant. */
  async createReferredClient(data: { name: string; phone: string; referrerClientId: string }) {
    return prisma.client.create({
      data: {
        name: data.name,
        phone: data.phone,
        document: '',
        tenantId: requireTenantId(),
        referredByClientId: data.referrerClientId,
      },
      select: { id: true, name: true },
    });
  }

  async createReferral(data: { referrerClientId: string; referredClientId: string }) {
    return prisma.referral.create({ data: { ...data, tenantId: requireTenantId(), status: 'pending' } });
  }

  /** Indicação pendente cujo indicado é este cliente (para converter no pagamento). */
  async findPendingByReferred(referredClientId: string) {
    return prisma.referral.findFirst({ where: { tenantId: requireTenantId(), referredClientId, status: 'pending' } });
  }

  async markConverted(id: string, rewardCents: number, at: Date) {
    return prisma.referral.update({ where: { id }, data: { status: 'converted', rewardCents, convertedAt: at } });
  }

  async getClientCredit(clientId: string): Promise<number> {
    const c = await prisma.client.findFirst({ where: { id: clientId, tenantId: requireTenantId() }, select: { referralCreditCents: true } });
    return c?.referralCreditCents ?? 0;
  }

  async addCredit(clientId: string, cents: number) {
    await prisma.client.update({ where: { id: clientId }, data: { referralCreditCents: { increment: cents } } });
  }

  async consumeCredit(clientId: string, cents: number) {
    await prisma.client.update({ where: { id: clientId }, data: { referralCreditCents: { decrement: cents } } });
  }

  /** Indicações do tenant, com nomes, para o painel. */
  async list(limit = 100) {
    const rows = await prisma.referral.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
      include: { referrer: { select: { name: true } }, referred: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      referrerName: r.referrer?.name ?? '—',
      referredName: r.referred?.name ?? '—',
      status: r.status,
      rewardCents: r.rewardCents,
      createdAt: r.createdAt,
      convertedAt: r.convertedAt,
    }));
  }

  async summary() {
    const rows = await prisma.referral.findMany({ where: { tenantId: requireTenantId() }, select: { status: true, rewardCents: true } });
    let pending = 0;
    let converted = 0;
    let rewardCents = 0;
    for (const r of rows) {
      if (r.status === 'converted') { converted++; rewardCents += r.rewardCents; }
      else pending++;
    }
    return { total: rows.length, pending, converted, rewardCents };
  }
}
