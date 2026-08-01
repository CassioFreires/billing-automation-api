import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { ModuleGrant } from '../domain/modules.js';

/**
 * Titularidade de módulos por tenant (spec 0051). `listByTenantId` é cross-tenant
 * (console do super-admin resolve o tenant pelo id da URL), sem contexto ALS.
 */
export class ModuleEntitlementRepository {
  /** Grants do tenant corrente (contexto ALS). */
  async listByTenant(): Promise<ModuleGrant[]> {
    const rows = await prisma.moduleEntitlement.findMany({
      where: { tenantId: requireTenantId() },
      select: { moduleKey: true, granted: true },
    });
    return rows;
  }

  /** Grants de um tenant explícito (admin — sem requireTenantId). */
  async listByTenantId(tenantId: string): Promise<ModuleGrant[]> {
    const rows = await prisma.moduleEntitlement.findMany({
      where: { tenantId },
      select: { moduleKey: true, granted: true },
    });
    return rows;
  }

  /** Concede/revoga um módulo p/ um tenant explícito (admin). Idempotente. */
  async upsert(tenantId: string, moduleKey: string, granted: boolean): Promise<ModuleGrant> {
    const row = await prisma.moduleEntitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      create: { tenantId, moduleKey, granted },
      update: { granted },
      select: { moduleKey: true, granted: true },
    });
    return row;
  }
}
