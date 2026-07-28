import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { DEFAULT_BRAND_COLOR } from '../domain/brand.js';

/**
 * White-label (spec 0050). Cor de marca por tenant. `getColorByTenant` é
 * cross-tenant (páginas públicas resolvem o tenant pela fatura/token), sem contexto.
 */
export class BrandRepository {
  async getColor(): Promise<string> {
    const s = await prisma.brandSetting.findUnique({ where: { tenantId: requireTenantId() } });
    return s?.brandColor ?? DEFAULT_BRAND_COLOR;
  }

  async upsertColor(brandColor: string): Promise<string> {
    const tenantId = requireTenantId();
    const s = await prisma.brandSetting.upsert({
      where: { tenantId },
      create: { tenantId, brandColor },
      update: { brandColor },
    });
    return s.brandColor;
  }

  /** Cor de marca de um tenant explícito (público — sem requireTenantId). */
  async getColorByTenant(tenantId: string): Promise<string> {
    const s = await prisma.brandSetting.findUnique({ where: { tenantId } });
    return s?.brandColor ?? DEFAULT_BRAND_COLOR;
  }
}
