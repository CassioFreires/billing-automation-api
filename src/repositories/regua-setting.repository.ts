import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { ReguaStep } from '../domain/regua.js';

/** Acesso à régua de cobrança do tenant (spec 0026). Escopo por tenant. */
export class ReguaSettingRepository {
  async findByTenant() {
    return prisma.reguaSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  async upsert(data: { enabled: boolean; steps: ReguaStep[] }) {
    const tenantId = requireTenantId();
    return prisma.reguaSetting.upsert({
      where: { tenantId },
      update: { enabled: data.enabled, steps: data.steps as unknown as object },
      create: { tenantId, enabled: data.enabled, steps: data.steps as unknown as object },
    });
  }
}
