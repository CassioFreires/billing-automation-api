import { ContractRepository } from '../repositories/contract.repository.js';

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

export interface ContractView {
  title: string;
  body: string;
  version: number;
  accepted: boolean;
  acceptedAt: Date | null;
}

/**
 * Contrato no Celular (spec 0040, F14). Config do dono + leitura/aceite no Portal
 * (com prova). O aceite é a base legal que o F12 (bloqueio) vai exigir.
 */
export class ContractService {
  private repo: ContractRepository;

  constructor(deps?: { repo?: ContractRepository }) {
    this.repo = deps?.repo ?? new ContractRepository();
  }

  // ── Dono (tenant no contexto) ──────────────────────────────────────────────
  async getSettings() {
    const s = await this.repo.getSetting();
    return {
      enabled: s?.enabled ?? false,
      title: s?.title ?? 'Contrato de prestação de serviço',
      body: s?.body ?? '',
      version: s?.version ?? 1,
    };
  }

  async updateSettings(data: { enabled?: boolean; title?: string; body?: string }) {
    const s = await this.repo.upsertSetting(data);
    return { enabled: s.enabled, title: s.title, body: s.body, version: s.version };
  }

  // ── Portal (tenant explícito, sem contexto) ────────────────────────────────

  /** Contrato ativo do tenant + se este cliente já aceitou a versão atual. */
  async getForClient(clientId: string, tenantId: string): Promise<ContractView | null> {
    const s = await this.repo.getSettingByTenant(tenantId);
    if (!s || !s.enabled || !s.body.trim()) return null; // sem contrato ativo → nada a assinar
    const latest = await this.repo.latestAcceptance(clientId, tenantId);
    const accepted = !!latest && latest.version >= s.version;
    return {
      title: s.title,
      body: s.body,
      version: s.version,
      accepted,
      acceptedAt: accepted ? latest!.acceptedAt : null,
    };
  }

  /** Registra o aceite (prova). Idempotente por (cliente, versão) — RN-4005. */
  async accept(params: {
    clientId: string;
    tenantId: string;
    name: string;
    document?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  }) {
    const s = await this.repo.getSettingByTenant(params.tenantId);
    if (!s || !s.enabled || !s.body.trim()) throw new NotFoundError('Nenhum contrato ativo para assinar.');
    if (!params.name || params.name.trim().length < 3) throw new BadRequestError('Informe seu nome completo.');

    const latest = await this.repo.latestAcceptance(params.clientId, params.tenantId);
    if (latest && latest.version === s.version) {
      // já aceitou esta versão — idempotente
      return { accepted: true, version: latest.version, acceptedAt: latest.acceptedAt };
    }

    const rec = await this.repo.recordAcceptance({
      clientId: params.clientId,
      tenantId: params.tenantId,
      version: s.version,
      acceptedName: params.name.trim(),
      acceptedDocument: params.document ?? null,
      ipHash: params.ipHash ?? null,
      userAgent: params.userAgent ?? null,
    });
    return { accepted: true, version: rec.version, acceptedAt: rec.acceptedAt };
  }
}
