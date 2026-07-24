import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Contrato no Celular (spec 0040, F14). Config por tenant + prova de aceite.
 * Métodos do DONO usam o tenant do contexto; os do PORTAL recebem `tenantId`
 * explícito (rota pública sem contexto — entrada global, como o Elo).
 */
export class ContractRepository {
  /** Config do tenant atual (dono). Null se ainda não configurou. */
  async getSetting() {
    return prisma.contractSetting.findUnique({ where: { tenantId: requireTenantId() } });
  }

  /** Config por tenant explícito (portal). */
  async getSettingByTenant(tenantId: string) {
    return prisma.contractSetting.findUnique({ where: { tenantId } });
  }

  /**
   * Upsert da config (dono). Sobe a VERSÃO quando `title`/`body` mudam (RN-4001) —
   * aceites antigos continuam válidos para a versão que assinaram.
   */
  async upsertSetting(data: { enabled?: boolean; title?: string; body?: string }) {
    const tenantId = requireTenantId();
    const existing = await prisma.contractSetting.findUnique({ where: { tenantId } });

    const contentChanged = existing
      ? (data.title !== undefined && data.title !== existing.title) ||
        (data.body !== undefined && data.body !== existing.body)
      : false;
    const version = existing ? (contentChanged ? existing.version + 1 : existing.version) : 1;

    return prisma.contractSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: data.enabled ?? false,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        version: 1,
      },
      update: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        version,
      },
    });
  }

  /** Aceite mais recente do cliente (para status/idempotência). `tenantId` explícito. */
  async latestAcceptance(clientId: string, tenantId: string) {
    return prisma.contractAcceptance.findFirst({
      where: { clientId, tenantId },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  async recordAcceptance(data: {
    clientId: string;
    tenantId: string;
    version: number;
    acceptedName: string;
    acceptedDocument?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  }) {
    return prisma.contractAcceptance.create({
      data: {
        clientId: data.clientId,
        tenantId: data.tenantId,
        version: data.version,
        acceptedName: data.acceptedName,
        acceptedDocument: data.acceptedDocument ?? null,
        ipHash: data.ipHash ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }
}
