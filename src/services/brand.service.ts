import { BrandRepository } from '../repositories/brand.repository.js';
import { normalizeBrandColor } from '../domain/brand.js';

/** White-label (spec 0050). Cor de marca do tenant. */
export class BrandService {
  private repo: BrandRepository;
  constructor(deps?: { repo?: BrandRepository }) {
    this.repo = deps?.repo ?? new BrandRepository();
  }

  async getSettings() {
    return { brandColor: await this.repo.getColor() };
  }

  /** Valida/normaliza o hex e salva. Lança BrandValidationError em cor inválida. */
  async updateSettings(brandColor: string) {
    const color = normalizeBrandColor(brandColor);
    return { brandColor: await this.repo.upsertColor(color) };
  }

  /** Cor de um tenant explícito — para as páginas públicas. */
  async getColorByTenant(tenantId: string) {
    return this.repo.getColorByTenant(tenantId);
  }
}
