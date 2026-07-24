import { AccessRepository } from '../repositories/access.repository.js';
import { decideAccess, type AccessOverride } from '../domain/access.js';

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

/**
 * Liga/Desliga o Acesso (spec 0042, F12). Config do tenant + estado de acesso por
 * cliente, derivado do pagamento pelo domínio puro `decideAccess` (com travas de
 * segurança). Só leitura + override manual. Escopo por tenant.
 */
export class AccessService {
  private repo: AccessRepository;

  constructor(deps?: { repo?: AccessRepository }) {
    this.repo = deps?.repo ?? new AccessRepository();
  }

  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: { enabled?: boolean; graceDays?: number; requireSignedContract?: boolean }) {
    const clean = {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.graceDays !== undefined ? { graceDays: clampGrace(data.graceDays) } : {}),
      ...(data.requireSignedContract !== undefined ? { requireSignedContract: data.requireSignedContract } : {}),
    };
    return this.repo.upsertSettings(clean);
  }

  /** Estado de acesso de todos os clientes do tenant (derivado + override). */
  async listClientsAccess(now: Date = new Date()) {
    const [settings, inputs] = await Promise.all([this.repo.getSettings(), this.repo.findAccessInputs(now)]);
    return inputs.map((i) => {
      const d = decideAccess({
        enabled: settings.enabled,
        hasOverdue: i.hasOverdue,
        maxDaysOverdue: i.maxDaysOverdue,
        graceDays: settings.graceDays,
        requireSignedContract: settings.requireSignedContract,
        contractAccepted: i.contractAccepted,
        override: (i.override ?? 'none') as AccessOverride,
      });
      return {
        clientId: i.clientId,
        name: i.name,
        state: d.state,
        granted: d.granted,
        reason: d.reason,
        override: i.override ?? 'none',
        maxDaysOverdue: i.maxDaysOverdue,
      };
    });
  }

  /** Override manual (allow | block | none). Retorna 404 se o cliente não for do tenant. */
  async setOverride(clientId: string, override: string) {
    if (!['allow', 'block', 'none'].includes(override)) {
      throw new BadRequestError('Override inválido (use allow, block ou none).');
    }
    const res = await this.repo.setOverride(clientId, override === 'none' ? null : override);
    if (!res) throw new NotFoundError('Cliente não encontrado.');
    return res;
  }
}

function clampGrace(n: number): number {
  return Math.max(0, Math.min(90, Math.round(n)));
}
