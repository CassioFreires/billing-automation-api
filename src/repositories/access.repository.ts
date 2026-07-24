import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

const DAY_MS = 86_400_000;
const OPEN_STATUSES = ['PENDING', 'OVERDUE'];

export interface AccessSettingsView {
  enabled: boolean;
  graceDays: number;
  requireSignedContract: boolean;
}

export interface ClientAccessInput {
  clientId: string;
  name: string;
  override: string | null;
  hasOverdue: boolean;
  maxDaysOverdue: number;
  contractAccepted: boolean;
}

/**
 * Liga/Desliga o Acesso (spec 0042, F12). Config por tenant + agregação dos sinais
 * por cliente (vencidos + contrato) para o domínio decidir o estado. Escopo por tenant.
 */
export class AccessRepository {
  async getSettings(): Promise<AccessSettingsView> {
    const s = await prisma.accessSetting.findUnique({ where: { tenantId: requireTenantId() } });
    return {
      enabled: s?.enabled ?? false,
      graceDays: s?.graceDays ?? 3,
      requireSignedContract: s?.requireSignedContract ?? true,
    };
  }

  async upsertSettings(data: { enabled?: boolean; graceDays?: number; requireSignedContract?: boolean }) {
    const tenantId = requireTenantId();
    const s = await prisma.accessSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data },
    });
    return { enabled: s.enabled, graceDays: s.graceDays, requireSignedContract: s.requireSignedContract };
  }

  /** Override manual do cliente (scoped tenant). `override` null = volta ao derivado. */
  async setOverride(clientId: string, override: string | null) {
    const tenantId = requireTenantId();
    const client = await prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) return null;
    await prisma.client.update({ where: { id: clientId }, data: { accessOverride: override } });
    return { clientId, override };
  }

  /** Sinais por cliente para decidir acesso (vencidos + contrato aceito). */
  async findAccessInputs(now: Date): Promise<ClientAccessInput[]> {
    const tenantId = requireTenantId();

    const [clients, invoices, contract, acceptances] = await Promise.all([
      prisma.client.findMany({ where: { tenantId }, select: { id: true, name: true, accessOverride: true } }),
      prisma.invoice.findMany({
        where: { tenantId, status: { in: OPEN_STATUSES }, dueDate: { lt: now } },
        select: { clientId: true, dueDate: true },
      }),
      prisma.contractSetting.findUnique({ where: { tenantId }, select: { version: true, enabled: true } }),
      prisma.contractAcceptance.groupBy({ by: ['clientId'], where: { tenantId }, _max: { version: true } }),
    ]);

    const overdueByClient = new Map<string, number>(); // clientId → maior dias de atraso
    for (const inv of invoices) {
      const days = Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY_MS));
      overdueByClient.set(inv.clientId, Math.max(overdueByClient.get(inv.clientId) ?? 0, days));
    }

    const acceptedVersionByClient = new Map<string, number>();
    for (const a of acceptances) acceptedVersionByClient.set(a.clientId, a._max.version ?? 0);

    const contractActive = !!contract && contract.enabled;

    return clients.map((c) => {
      const maxDaysOverdue = overdueByClient.get(c.id) ?? 0;
      const contractAccepted =
        contractActive && (acceptedVersionByClient.get(c.id) ?? 0) >= (contract!.version ?? 1);
      return {
        clientId: c.id,
        name: c.name,
        override: c.accessOverride ?? null,
        hasOverdue: overdueByClient.has(c.id),
        maxDaysOverdue,
        contractAccepted,
      };
    });
  }
}
