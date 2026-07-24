import { RetentionRepository } from '../repositories/retention.repository.js';
import { decideSaveOffer, addMonths, type SaveOffer } from '../domain/save-offer.js';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/**
 * Segura Quem Quer Sair (spec 0037/0038, F11 + descontos configuráveis). Recomenda
 * a oferta (por motivo + saúde/F2), expõe a config do tenant (% e meses do desconto)
 * e, ao resolver, aplica o efeito concreto: pausar, cancelar ou gravar desconto ativo
 * na assinatura (a geração recorrente aplica nas faturas). Escopo por tenant.
 */
export class RetentionService {
  private repo: RetentionRepository;

  constructor(deps?: { repo?: RetentionRepository }) {
    this.repo = deps?.repo ?? new RetentionRepository();
  }

  /** Abre o pedido e devolve a oferta recomendada + a config sugerida (RN-3701/3801). */
  async openRequest(subscriptionId: string, reason: string | null) {
    const sub = await this.repo.findSubscriptionWithHealth(subscriptionId);
    if (!sub) throw new NotFoundError('Assinatura não encontrada.');

    const settings = await this.repo.getSettings();
    let decision = decideSaveOffer(reason, sub.healthBand);

    // Respeita os toggles da config: cai para a alternativa habilitada (RN-3804).
    if (decision.offer === 'discount' && !settings.discountEnabled) {
      decision = { offer: 'pause', message: decideSaveOffer('nao_uso').message };
    }
    if (decision.offer === 'pause' && !settings.pauseEnabled && settings.discountEnabled) {
      decision = decideSaveOffer('preco', 'healthy'); // vira desconto
    }

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
      suggestedPercent: settings.discountPercent,
      suggestedMonths: settings.discountDurationMonths,
      settings,
      subscription: { id: sub.id, clientName: sub.clientName, healthBand: sub.healthBand },
    };
  }

  /**
   * Resolve (RN-3703/3802): `saved` aplica a oferta (pause pausa; discount grava
   * desconto ativo na assinatura), `cancelled` cancela. Idempotente — já resolvido → 409.
   */
  async resolveRequest(
    id: string,
    outcome: 'saved' | 'cancelled',
    opts: { offer?: SaveOffer; discountPercent?: number; discountMonths?: number } = {},
    now: Date = new Date()
  ) {
    const req = await this.repo.findByIdForTenant(id);
    if (!req) throw new NotFoundError('Pedido de cancelamento não encontrado.');
    if (req.status !== 'open') throw new ConflictError('Pedido já resolvido.');

    const applied = outcome === 'saved' ? (opts.offer ?? (req.recommended as SaveOffer | null)) : null;

    let discountPercent: number | null = null;
    let discountUntil: Date | null = null;
    if (outcome === 'saved' && applied === 'discount') {
      const settings = await this.repo.getSettings();
      if (!settings.discountEnabled) throw new ConflictError('Desconto de retenção desabilitado.');
      const percent = clampPercent(opts.discountPercent ?? settings.discountPercent);
      const months = clampMonths(opts.discountMonths ?? settings.discountDurationMonths);
      discountPercent = percent;
      discountUntil = addMonths(now, months);
    }

    const updated = await this.repo.resolve(id, {
      outcome,
      offer: applied,
      subscriptionId: req.subscriptionId,
      discountPercent,
      discountUntil,
    });

    return {
      id: updated.id,
      status: updated.status,
      saveOffer: updated.saveOffer,
      appliedPercent: updated.appliedPercent,
      appliedUntil: updated.appliedUntil,
    };
  }

  async listRequests() {
    return this.repo.listForTenant();
  }

  /** Config de retenção do tenant (defaults se ainda não configurou). */
  async getSettings() {
    return this.repo.getSettings();
  }

  /** Atualiza a config (upsert por tenant). Valida faixas. */
  async updateSettings(data: {
    discountPercent?: number;
    discountDurationMonths?: number;
    discountEnabled?: boolean;
    pauseEnabled?: boolean;
  }) {
    const clean = {
      ...(data.discountPercent !== undefined ? { discountPercent: clampPercent(data.discountPercent) } : {}),
      ...(data.discountDurationMonths !== undefined ? { discountDurationMonths: clampMonths(data.discountDurationMonths) } : {}),
      ...(data.discountEnabled !== undefined ? { discountEnabled: data.discountEnabled } : {}),
      ...(data.pauseEnabled !== undefined ? { pauseEnabled: data.pauseEnabled } : {}),
    };
    return this.repo.upsertSettings(clean);
  }
}

function clampPercent(n: number): number {
  return Math.max(1, Math.min(100, Math.round(n)));
}
function clampMonths(n: number): number {
  return Math.max(1, Math.min(12, Math.round(n)));
}
