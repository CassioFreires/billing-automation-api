import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

// Campos "leves" do contrato (sem o binário do PDF) — usados nas leituras normais.
const LIGHT_SELECT = {
  enabled: true,
  title: true,
  body: true,
  version: true,
  mode: true,
  fileName: true,
  fileMime: true,
  fileSize: true,
} as const;

/**
 * Contrato no Celular (spec 0040/0041, F14). Config por tenant + prova de aceite +
 * arquivo (PDF) guardado no banco. Métodos do DONO usam o tenant do contexto; os do
 * PORTAL recebem `tenantId` explícito (rota pública, entrada global).
 */
export class ContractRepository {
  async getSetting() {
    return prisma.contractSetting.findUnique({
      where: { tenantId: requireTenantId() },
      select: LIGHT_SELECT,
    });
  }

  async getSettingByTenant(tenantId: string) {
    return prisma.contractSetting.findUnique({ where: { tenantId }, select: LIGHT_SELECT });
  }

  /** Atualiza texto/flags. Sobe a versão quando `title`/`body` mudam (RN-4001). */
  async upsertSetting(data: { enabled?: boolean; title?: string; body?: string; mode?: string }) {
    const tenantId = requireTenantId();
    const existing = await prisma.contractSetting.findUnique({ where: { tenantId } });

    const contentChanged = existing
      ? (data.title !== undefined && data.title !== existing.title) ||
        (data.body !== undefined && data.body !== existing.body)
      : false;
    const version = existing ? (contentChanged ? existing.version + 1 : existing.version) : 1;

    return prisma.contractSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: data.enabled ?? false,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        version: 1,
      },
      update: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        version,
      },
      select: LIGHT_SELECT,
    });
  }

  /** Guarda o PDF (modo file) e sobe a versão (conteúdo mudou). */
  async setFile(data: { fileName: string; fileMime: string; fileSize: number; fileData: Buffer }) {
    const tenantId = requireTenantId();
    const existing = await prisma.contractSetting.findUnique({ where: { tenantId } });
    const version = existing ? existing.version + 1 : 1;
    // Prisma Bytes espera Uint8Array<ArrayBuffer>; converte o Buffer (cópia).
    const bytes = new Uint8Array(data.fileData);

    return prisma.contractSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        mode: 'file',
        enabled: true,
        fileName: data.fileName,
        fileMime: data.fileMime,
        fileSize: data.fileSize,
        fileData: bytes,
        version: 1,
      },
      update: {
        mode: 'file',
        fileName: data.fileName,
        fileMime: data.fileMime,
        fileSize: data.fileSize,
        fileData: bytes,
        version,
      },
      select: LIGHT_SELECT,
    });
  }

  /** Bytes do PDF (para servir). `tenantId` explícito (serve dono e portal). */
  async getFileByTenant(tenantId: string) {
    return prisma.contractSetting.findUnique({
      where: { tenantId },
      select: { fileName: true, fileMime: true, fileData: true, mode: true },
    });
  }

  async latestAcceptance(clientId: string, tenantId: string) {
    return prisma.contractAcceptance.findFirst({
      where: { clientId, tenantId },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  async recordAcceptance(data: {
    clientId: string;
    tenantId: string;
    version: number;
    acceptedName: string;
    acceptedDocument?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  }) {
    return prisma.contractAcceptance.create({
      data: {
        clientId: data.clientId,
        tenantId: data.tenantId,
        version: data.version,
        acceptedName: data.acceptedName,
        acceptedDocument: data.acceptedDocument ?? null,
        ipHash: data.ipHash ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }
}
