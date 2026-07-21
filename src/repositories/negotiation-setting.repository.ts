import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/** Acesso às regras de autonegociação do tenant (spec 0018). Escopo por tenant. */
export class NegotiationSettingRepository {
  async findByTenant() {
    return prisma.negotiationSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  /** Cria ou atualiza as regras do tenant atual. */
  async upsert(data: {
    enabled: boolean;
    hesitationOpens: number;
    discountEnabled: boolean;
    discountPercent: number;
    installmentsEnabled: boolean;
    maxInstallments: number;
    deferEnabled: boolean;
    deferMaxDays: number;
    deferFeePercent: number;
  }) {
    const tenantId = requireTenantId();
    return prisma.negotiationSetting.upsert({
      where: { tenantId },
      update: { ...data },
      create: { tenantId, ...data },
    });
  }
}
