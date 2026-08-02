import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { OfferRepository } from '../repositories/offer.repository.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { PaymentSettingService } from './payment-setting.service.js';
import { PaymentGatewayProvider, resolvePaymentGatewayForTenant } from '../apis/payment/index.js';
import { runWithTenant } from '../context/tenant-context.js';
import { normalizeOffer, buildAddonCharge, type OfferInput } from '../domain/offer.js';

/** Erros de fluxo mapeados para HTTP no controller. */
export const OfferError = {
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND', // → 404
  OFFER_NOT_FOUND: 'OFFER_NOT_FOUND',     // → 404
  OFFER_INACTIVE: 'OFFER_INACTIVE',       // → 409
  HAS_PURCHASES: 'HAS_PURCHASES',         // → 409 (não apaga oferta já comprada)
} as const;

/**
 * Loja no Pagamento (spec 0044, F15). CRUD das ofertas (dono, JWT) + fluxo
 * público do checkout: listar ofertas e ACEITAR uma, gerando uma cobrança
 * one-time separada (reusa toda a infra de fatura/pagamento, como o acordo 0018).
 */
export class OfferService {
  private repo: OfferRepository;
  private invoices: InvoiceRepository;
  private paymentSettings: PaymentSettingService;
  private injectedGateway?: PaymentGatewayProvider;

  constructor(deps?: {
    repo?: OfferRepository;
    invoices?: InvoiceRepository;
    paymentSettings?: PaymentSettingService;
    gateway?: PaymentGatewayProvider;
  }) {
    this.repo = deps?.repo ?? new OfferRepository();
    this.invoices = deps?.invoices ?? new InvoiceRepository();
    this.paymentSettings = deps?.paymentSettings ?? new PaymentSettingService();
    this.injectedGateway = deps?.gateway;
  }

  private async gatewayForTenant(): Promise<PaymentGatewayProvider> {
    if (this.injectedGateway) return this.injectedGateway;
    const config = await this.paymentSettings.getForCurrentTenant();
    return resolvePaymentGatewayForTenant(config);
  }

  // --- Dono (JWT) ---
  async list() {
    return this.repo.listAll();
  }

  async create(input: OfferInput) {
    return this.repo.create(normalizeOffer(input));
  }

  async update(id: string, input: Partial<OfferInput>) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(OfferError.OFFER_NOT_FOUND);
    const merged = normalizeOffer({
      name: input.name ?? existing.name,
      priceCents: input.priceCents ?? existing.priceCents,
      type: input.type ?? existing.type,
      active: input.active ?? existing.active,
    });
    return this.repo.update(id, merged);
  }

  /** Apaga a oferta; se já houve compra, recusa (preserva histórico) — desative em vez de apagar. */
  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(OfferError.OFFER_NOT_FOUND);
    if ((await this.repo.countPurchases(id)) > 0) throw new Error(OfferError.HAS_PURCHASES);
    return this.repo.deleteById(id);
  }

  async summary() {
    return this.repo.summary();
  }

  // --- Público (checkout do Elo) ---

  /** Ofertas ativas para a vitrine. Tenant resolvido pela fatura do checkout. */
  async listForToken(token: string) {
    const invoice = await this.invoices.findByLinkToken(token);
    if (!invoice) throw new Error(OfferError.INVOICE_NOT_FOUND);
    return runWithTenant(invoice.tenantId, async () => {
      const offers = await this.repo.listActive();
      return offers.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, type: o.type }));
    });
  }

  /**
   * Aceita uma oferta no checkout: gera uma cobrança SEPARADA do add-on (gateway
   * por tenant) e registra a compra. Mesmo padrão de reserva→cobra→anexa do
   * acordo (0018): se o gateway falha, desfaz a reserva.
   */
  async acceptOffer(token: string, offerId: string, now: Date = new Date()) {
    const invoice = await this.invoices.findByLinkToken(token);
    if (!invoice) throw new Error(OfferError.INVOICE_NOT_FOUND);

    return runWithTenant(invoice.tenantId, async () => {
      const offer = await this.repo.findById(offerId);
      if (!offer) throw new Error(OfferError.OFFER_NOT_FOUND);
      if (!offer.active) throw new Error(OfferError.OFFER_INACTIVE);

      const draft = buildAddonCharge(offer, now);
      const value = new Prisma.Decimal(draft.value);

      // Reserva a fatura do add-on ANTES de cobrar (mesmo padrão do createPayment).
      const reserved = await this.invoices.create({
        clientId: invoice.clientId,
        value,
        dueDate: draft.dueDate,
        items: [{ description: draft.description, quantity: 1, unitPrice: value }],
      });

      // Só apaga a reserva se a cobrança NÃO chegou a ser criada (spec 0054).
      let charge;
      try {
        const gateway = await this.gatewayForTenant();
        charge = await gateway.createCharge({
          reference: randomUUID(),
          amount: draft.value,
          dueDate: draft.dueDate,
          description: draft.description,
        });
      } catch (error) {
        await this.invoices.deleteById(reserved.id).catch(() => {});
        throw error;
      }

      // Cobrança criada — a partir daqui NÃO apagamos a fatura (evita cobrança órfã).
      const addon = await this.invoices.attachCharge(reserved.id, {
        gatewayId: charge.gatewayId,
        pixCopyPaste: charge.pixCopyPaste,
        pixQrCode: charge.pixQrCode,
        checkoutUrl: charge.checkoutUrl,
      });
      // Registro da compra é best-effort: a fatura já existe e é conciliável pelo webhook.
      await this.repo
        .createPurchase({ offerId: offer.id, invoiceId: addon.id, clientId: invoice.clientId, priceCents: offer.priceCents })
        .catch((err) => console.error('⚠️ Loja: falha ao registrar a compra (fatura segue válida):', err));
      return {
        newInvoice: {
          id: addon.id,
          value: Number(addon.value),
          dueDate: addon.dueDate,
          checkoutUrl: addon.checkoutUrl ?? null,
          pixCopyPaste: addon.pixCopyPaste ?? null,
        },
      };
    });
  }
}
