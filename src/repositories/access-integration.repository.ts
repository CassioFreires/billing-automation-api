import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Conexão IoT/Catracas (spec 0043, F13). Credenciais de integração por tenant
 * (API key + webhook) e log append-only de transições de acesso.
 *
 * A API key é guardada só como HASH (a chave crua é mostrada uma vez na geração).
 * `findByApiKeyHash` é a ÚNICA leitura cross-tenant (o equipamento não tem JWT):
 * resolve o tenant a partir da chave, e por isso NÃO usa `requireTenantId()`.
 */
export class AccessIntegrationRepository {
  async get() {
    return prisma.accessIntegration.findUnique({ where: { tenantId: requireTenantId() } });
  }

  async upsert(data: {
    enabled?: boolean;
    apiKeyHash?: string | null;
    apiKeyPrefix?: string | null;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  }) {
    const tenantId = requireTenantId();
    return prisma.accessIntegration.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data },
    });
  }

  /** Resolve o tenant a partir do hash da API key (cross-tenant, sem contexto). */
  async findByApiKeyHash(apiKeyHash: string): Promise<{ tenantId: string; enabled: boolean } | null> {
    const row = await prisma.accessIntegration.findFirst({
      where: { apiKeyHash },
      select: { tenantId: true, enabled: true },
    });
    return row ?? null;
  }

  async createEvent(data: {
    clientId: string;
    tenantId: string;
    fromState: string | null;
    toState: string;
    granted: boolean;
    reason: string;
    webhookStatus: string;
    webhookCode?: number | null;
  }) {
    return prisma.accessEvent.create({ data });
  }

  /** Últimos eventos do tenant (mais recentes primeiro), com nome do cliente. */
  async listEvents(limit = 50) {
    const rows = await prisma.accessEvent.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
      include: { client: { select: { name: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      clientId: e.clientId,
      clientName: e.client?.name ?? '—',
      fromState: e.fromState,
      toState: e.toState,
      granted: e.granted,
      reason: e.reason,
      webhookStatus: e.webhookStatus,
      webhookCode: e.webhookCode,
      createdAt: e.createdAt,
    }));
  }
}
