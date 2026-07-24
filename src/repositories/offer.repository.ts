import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import type { NormalizedOffer } from '../domain/offer.js';

/**
 * Loja no Pagamento (spec 0044, F15). Ofertas do tenant + registro de compras
 * (ligadas à fatura do add-on). Escopo por tenant. A leitura pública das ofertas
 * ativas roda dentro de `runWithTenant` (tenant resolvido pela fatura do checkout).
 */
export class OfferRepository {
  async listAll() {
    return prisma.offerProduct.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Só as ofertas ATIVAS — para a vitrine do checkout. */
  async listActive() {
    return prisma.offerProduct.findMany({
      where: { tenantId: requireTenantId(), active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    return prisma.offerProduct.findFirst({ where: { id, tenantId: requireTenantId() } });
  }

  async create(data: NormalizedOffer) {
    return prisma.offerProduct.create({ data: { ...data, tenantId: requireTenantId() } });
  }

  /** Atualiza campos da oferta (scoped tenant). Retorna null se não for do tenant. */
  async update(id: string, data: Partial<NormalizedOffer>) {
    const found = await this.findById(id);
    if (!found) return null;
    return prisma.offerProduct.update({ where: { id }, data });
  }

  async countPurchases(offerId: string): Promise<number> {
    return prisma.offerPurchase.count({ where: { offerId, tenantId: requireTenantId() } });
  }

  async deleteById(id: string) {
    const found = await this.findById(id);
    if (!found) return null;
    await prisma.offerProduct.delete({ where: { id } });
    return found;
  }

  async createPurchase(data: { offerId: string; invoiceId: string; clientId: string; priceCents: number }) {
    return prisma.offerPurchase.create({ data: { ...data, tenantId: requireTenantId() } });
  }

  /**
   * Resumo da loja para o painel: total de ofertas ativas, nº de compras e
   * receita REALIZADA (compras cuja fatura foi paga). Pilotos são pequenos —
   * soma em memória é suficiente e evita SQL bruto.
   */
  async summary() {
    const tenantId = requireTenantId();
    const [activeOffers, purchases] = await Promise.all([
      prisma.offerProduct.count({ where: { tenantId, active: true } }),
      prisma.offerPurchase.findMany({
        where: { tenantId },
        select: { priceCents: true, invoice: { select: { status: true } } },
      }),
    ]);
    let paidCount = 0;
    let paidCents = 0;
    for (const p of purchases) {
      if (p.invoice?.status === 'PAID') {
        paidCount++;
        paidCents += p.priceCents;
      }
    }
    return {
      activeOffers,
      purchases: purchases.length, // aceitas (cobrança gerada)
      paidPurchases: paidCount,    // efetivamente pagas
      revenueCents: paidCents,     // receita extra realizada
    };
  }
}
