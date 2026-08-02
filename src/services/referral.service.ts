import { randomBytes } from 'node:crypto';
import { ReferralRepository } from '../repositories/referral.repository.js';
import { runWithTenant } from '../context/tenant-context.js';
import { BrandRepository } from '../repositories/brand.repository.js';
import { rewardFor, clampReward, normalizeWho } from '../domain/referral.js';

export class ReferralError extends Error {}
export const RE = {
  CODE_NOT_FOUND: 'CODE_NOT_FOUND', // → 404
  DISABLED: 'DISABLED',             // → 409 (programa desligado)
  ALREADY_CLIENT: 'ALREADY_CLIENT', // → 409 (telefone já é cliente)
} as const;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I (ambíguos)

/**
 * Indique e Ganhe (spec 0046, F16). Código/link por cliente, captura pública do
 * amigo indicado, conversão no pagamento da 1ª fatura e crédito automático.
 */
export class ReferralService {
  private repo: ReferralRepository;
  constructor(deps?: { repo?: ReferralRepository }) {
    this.repo = deps?.repo ?? new ReferralRepository();
  }

  private genCode(len = 7): string {
    const bytes = randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }

  // --- Dono (JWT) ---
  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: { enabled?: boolean; rewardCents?: number; rewardWho?: string }) {
    const clean = {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.rewardCents !== undefined ? { rewardCents: clampReward(data.rewardCents) } : {}),
      ...(data.rewardWho !== undefined ? { rewardWho: normalizeWho(data.rewardWho) } : {}),
    };
    return this.repo.upsertSettings(clean);
  }

  async list() {
    return this.repo.list();
  }
  async summary() {
    return this.repo.summary();
  }

  /** Garante o código do cliente (gera se faltar) e devolve código + link público. */
  async ensureCode(clientId: string, baseUrl: string) {
    let code = await this.repo.getClientCode(clientId);
    if (!code) {
      for (let attempt = 0; attempt < 3 && !code; attempt++) {
        const candidate = this.genCode();
        try {
          await this.repo.setClientCode(clientId, candidate);
          code = candidate;
        } catch {
          /* colisão de unique — tenta outro */
        }
      }
    }
    const link = code ? `${baseUrl.replace(/\/$/, '')}/indicar/${code}` : null;
    return { code, link };
  }

  // --- Público (link de indicação) ---

  /** Info leve pra página pública: nome do indicador + se o programa está ativo. */
  async publicInfo(code: string) {
    const ref = await this.repo.findByReferralCode(code);
    if (!ref) throw new ReferralError(RE.CODE_NOT_FOUND);
    return runWithTenant(ref.tenantId, async () => {
      const settings = await this.repo.getSettings();
      const brandColor = await new BrandRepository().getColor();
      return { referrerName: ref.name, enabled: settings.enabled, rewardCents: settings.rewardCents, brandColor };
    });
  }

  /** Captura o amigo indicado: cria o cliente (lead) atribuído + a indicação pendente. */
  async capture(code: string, data: { name: string; phone: string }) {
    const ref = await this.repo.findByReferralCode(code);
    if (!ref) throw new ReferralError(RE.CODE_NOT_FOUND);

    return runWithTenant(ref.tenantId, async () => {
      const settings = await this.repo.getSettings();
      if (!settings.enabled) throw new ReferralError(RE.DISABLED);

      const existing = await this.repo.findClientByPhone(data.phone);
      if (existing) throw new ReferralError(RE.ALREADY_CLIENT);

      const referred = await this.repo.createReferredClient({
        name: data.name,
        phone: data.phone,
        referrerClientId: ref.id,
      });
      await this.repo.createReferral({ referrerClientId: ref.id, referredClientId: referred.id });
      return { ok: true };
    });
  }

  // --- Conversão + crédito (chamados pelo InvoiceService) ---

  /**
   * Chamado quando uma fatura é paga. Se o pagador é um indicado com indicação
   * pendente, converte e credita os dois (conforme a config). Best-effort e
   * idempotente (só a 1ª conversão concede). Roda no contexto do tenant.
   */
  async onInvoicePaid(clientId: string, tenantId: string, now: Date = new Date()): Promise<void> {
    await runWithTenant(tenantId, async () => {
      const settings = await this.repo.getSettings();
      if (!settings.enabled) return;
      const referral = await this.repo.findPendingByReferred(clientId);
      if (!referral) return;

      const toReferrer = rewardFor(settings, 'referrer');
      const toReferred = rewardFor(settings, 'referred');
      // Conversão + crédito ATÔMICOS e condicionais (spec 0054): só a 1ª chamada
      // que vence a corrida credita — nada de double-credit em pagamentos paralelos.
      await this.repo.convertAndCredit({
        referralId: referral.id,
        referrerClientId: referral.referrerClientId,
        referredClientId: referral.referredClientId,
        toReferrer,
        toReferred,
        at: now,
      });
    });
  }

  /** Crédito disponível do cliente (centavos). Usado pelo InvoiceService antes de cobrar. */
  async availableCredit(clientId: string): Promise<number> {
    return this.repo.getClientCredit(clientId);
  }

  /**
   * Reserva (debita) crédito de forma atômica ANTES de cobrar (spec 0054). Retorna se
   * conseguiu — o InvoiceService só aplica o desconto quando a reserva vence.
   */
  async tryReserveCredit(clientId: string, cents: number): Promise<boolean> {
    if (cents <= 0) return true;
    return this.repo.tryReserveCredit(clientId, cents);
  }

  /** Devolve crédito reservado quando a cobrança falha depois da reserva (rollback). */
  async refundCredit(clientId: string, cents: number): Promise<void> {
    if (cents > 0) await this.repo.refundCredit(clientId, cents);
  }
}
