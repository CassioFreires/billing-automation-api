import { RetentionRepository } from '../repositories/retention.repository.js';
import { decideSaveOffer, type SaveOffer } from '../domain/save-offer.js';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/**
 * Segura Quem Quer Sair (spec 0037, F11). Ao pedir cancelamento, recomenda uma
 * oferta de retenção (por motivo + saúde do cliente/F2) e resolve como salvo
 * (aplica a oferta) ou cancelado. Escopo por tenant.
 */
export class RetentionService {
  private repo: RetentionRepository;

  constructor(deps?: { repo?: RetentionRepository }) {
    this.repo = deps?.repo ?? new RetentionRepository();
  }

  /** Abre o pedido e devolve a oferta recomendada para a UI mostrar (RN-3701). */
  async openRequest(subscriptionId: string, reason: string | null) {
    const sub = await this.repo.findSubscriptionWithHealth(subscriptionId);
    if (!sub) throw new NotFoundError('Assinatura não encontrada.');

    const decision = decideSaveOffer(reason, sub.healthBand);
    const req = await this.repo.createRequest({
      subscriptionId: sub.id,
      clientId: sub.clientId,
      tenantId: sub.tenantId,
      reason: reason ?? null,
      recommended: decision.offer,
    });

    return {
      id: req.id,
      reason: req.reason,
      recommended: decision.offer,
      message: decision.message,
      subscription: { id: sub.id, clientName: sub.clientName, healthBand: sub.healthBand },
    };
  }

  /**
   * Resolve o pedido (RN-3703): `saved` aplica a oferta (pause pausa a assinatura),
   * `cancelled` efetiva o cancelamento. Idempotente — request já resolvido → 409.
   */
  async resolveRequest(id: string, outcome: 'saved' | 'cancelled', offer?: SaveOffer) {
    const req = await this.repo.findByIdForTenant(id);
    if (!req) throw new NotFoundError('Pedido de cancelamento não encontrado.');
    if (req.status !== 'open') {
      throw new ConflictError('Pedido já resolvido.');
    }

    // Oferta aplicada: a informada, senão a recomendada (só relevante quando saved).
    const applied = outcome === 'saved' ? (offer ?? (req.recommended as SaveOffer | null)) : null;
    const updated = await this.repo.resolve(id, outcome, applied, req.subscriptionId);
    return { id: updated.id, status: updated.status, saveOffer: updated.saveOffer };
  }

  /** Lista os pedidos do tenant (painel de retenção — salvos vs cancelados). */
  async listRequests() {
    return this.repo.listForTenant();
  }
}
