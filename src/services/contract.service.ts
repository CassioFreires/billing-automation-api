import { ContractRepository } from '../repositories/contract.repository.js';

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ContractView {
  title: string;
  version: number;
  accepted: boolean;
  acceptedAt: Date | null;
  mode: 'text' | 'file';
  body: string; // vazio quando mode = file
  fileName: string | null;
}

/**
 * Contrato no Celular (spec 0040/0041, F14). Config do dono (texto OU PDF) +
 * leitura/aceite no Portal (com prova). O PDF é guardado no banco (Bytes).
 */
export class ContractService {
  private repo: ContractRepository;

  constructor(deps?: { repo?: ContractRepository }) {
    this.repo = deps?.repo ?? new ContractRepository();
  }

  // ── Dono ───────────────────────────────────────────────────────────────────
  async getSettings() {
    const s = await this.repo.getSetting();
    return {
      enabled: s?.enabled ?? false,
      title: s?.title ?? 'Contrato de prestação de serviço',
      body: s?.body ?? '',
      version: s?.version ?? 1,
      mode: (s?.mode as 'text' | 'file') ?? 'text',
      fileName: s?.fileName ?? null,
      fileSize: s?.fileSize ?? null,
    };
  }

  async updateSettings(data: { enabled?: boolean; title?: string; body?: string; mode?: string }) {
    if (data.mode && !['text', 'file'].includes(data.mode)) {
      throw new BadRequestError('Modo inválido.');
    }
    const s = await this.repo.upsertSetting(data);
    return {
      enabled: s.enabled,
      title: s.title,
      body: s.body,
      version: s.version,
      mode: s.mode,
      fileName: s.fileName ?? null,
      fileSize: s.fileSize ?? null,
    };
  }

  /** Sobe o PDF do contrato (valida tipo/tamanho). Ativa o modo "file". */
  async setFile(fileName: string, mime: string, buffer: Buffer) {
    if (mime !== 'application/pdf' || !isPdf(buffer)) {
      throw new BadRequestError('Envie um arquivo PDF válido.');
    }
    if (buffer.length > MAX_PDF_BYTES) {
      throw new BadRequestError('O PDF é muito grande (máx. 5 MB).');
    }
    const safeName = (fileName || 'contrato.pdf').replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'contrato.pdf';
    const s = await this.repo.setFile({
      fileName: safeName,
      fileMime: 'application/pdf',
      fileSize: buffer.length,
      fileData: buffer,
    });
    return { mode: s.mode, fileName: s.fileName, fileSize: s.fileSize, version: s.version, enabled: s.enabled };
  }

  // ── Portal (tenant explícito) ───────────────────────────────────────────────
  async getForClient(clientId: string, tenantId: string): Promise<ContractView | null> {
    const s = await this.repo.getSettingByTenant(tenantId);
    if (!s || !s.enabled) return null;
    const hasContent = s.mode === 'file' ? !!s.fileName : !!s.body.trim();
    if (!hasContent) return null;

    const latest = await this.repo.latestAcceptance(clientId, tenantId);
    const accepted = !!latest && latest.version >= s.version;
    return {
      title: s.title,
      version: s.version,
      accepted,
      acceptedAt: accepted ? latest!.acceptedAt : null,
      mode: s.mode as 'text' | 'file',
      body: s.mode === 'file' ? '' : s.body,
      fileName: s.fileName ?? null,
    };
  }

  async accept(params: {
    clientId: string;
    tenantId: string;
    name: string;
    document?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  }) {
    const s = await this.repo.getSettingByTenant(params.tenantId);
    const hasContent = s ? (s.mode === 'file' ? !!s.fileName : !!s.body.trim()) : false;
    if (!s || !s.enabled || !hasContent) throw new NotFoundError('Nenhum contrato ativo para assinar.');
    if (!params.name || params.name.trim().length < 3) throw new BadRequestError('Informe seu nome completo.');

    const latest = await this.repo.latestAcceptance(params.clientId, params.tenantId);
    if (latest && latest.version === s.version) {
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

  /** Bytes do PDF para servir (dono/portal). Null se não houver arquivo. */
  async getFile(tenantId: string) {
    const f = await this.repo.getFileByTenant(tenantId);
    if (!f || f.mode !== 'file' || !f.fileData) return null;
    return {
      fileName: f.fileName ?? 'contrato.pdf',
      fileMime: f.fileMime ?? 'application/pdf',
      data: Buffer.from(f.fileData),
    };
  }
}

/** Confere a assinatura mágica do PDF (%PDF). */
function isPdf(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}
