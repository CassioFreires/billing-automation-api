import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/** Acesso à configuração de pagamento do tenant (spec 0012). Escopo por tenant. */
export class PaymentSettingRepository {
  async findByTenant() {
    return prisma.paymentSetting.findUnique({
      where: { tenantId: requireTenantId() },
    });
  }

  /** Cria ou atualiza a config do tenant atual. */
  async upsert(data: {
    provider: string;
    infinitepayHandle?: string | null;
    redirectUrl?: string | null;
  }) {
    const tenantId = requireTenantId();
    return prisma.paymentSetting.upsert({
      where: { tenantId },
      update: {
        provider: data.provider,
        infinitepayHandle: data.infinitepayHandle ?? null,
        redirectUrl: data.redirectUrl ?? null,
      },
      create: {
        tenantId,
        provider: data.provider,
        infinitepayHandle: data.infinitepayHandle ?? null,
        redirectUrl: data.redirectUrl ?? null,
      },
    });
  }
}
