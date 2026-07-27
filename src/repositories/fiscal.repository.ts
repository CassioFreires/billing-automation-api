import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';
import { encryptSecret, decryptSecret, isEncrypted } from '../infrastructure/crypto.js';

export interface FiscalSettingsView {
  enabled: boolean;
  provider: string;
  companyId: string | null;
  cityServiceCode: string | null;
  autoEmitOnPaid: boolean;
  hasApiKey: boolean;
}

/**
 * NFS-e / Nota Fiscal (spec 0047, F7). Config por tenant (apiKey cifrada em repouso)
 * + documentos fiscais por fatura. `findDocumentByProviderId` é cross-tenant (webhook
 * do provider), sem `requireTenantId()`.
 */
export class FiscalRepository {
  /** Visão para o painel — nunca expõe a apiKey. */
  async getSettings(): Promise<FiscalSettingsView> {
    const s = await prisma.fiscalSetting.findUnique({ where: { tenantId: requireTenantId() } });
    return {
      enabled: s?.enabled ?? false,
      provider: s?.provider ?? 'mock',
      companyId: s?.companyId ?? null,
      cityServiceCode: s?.cityServiceCode ?? null,
      autoEmitOnPaid: s?.autoEmitOnPaid ?? false,
      hasApiKey: !!s?.apiKey,
    };
  }

  /** Config para USO (com apiKey decifrada) — só internamente, nunca pra fora. */
  async getSettingsForUse() {
    const s = await prisma.fiscalSetting.findUnique({ where: { tenantId: requireTenantId() } });
    if (!s) return null;
    return {
      enabled: s.enabled,
      provider: s.provider,
      companyId: s.companyId,
      cityServiceCode: s.cityServiceCode,
      autoEmitOnPaid: s.autoEmitOnPaid,
      apiKey: s.apiKey ? (isEncrypted(s.apiKey) ? decryptSecret(s.apiKey) : s.apiKey) : null,
      webhookSecret: s.webhookSecret ? (isEncrypted(s.webhookSecret) ? decryptSecret(s.webhookSecret) : s.webhookSecret) : null,
    };
  }

  async upsertSettings(data: {
    enabled?: boolean;
    provider?: string;
    apiKey?: string | null;
    webhookSecret?: string | null;
    companyId?: string | null;
    cityServiceCode?: string | null;
    autoEmitOnPaid?: boolean;
  }) {
    const tenantId = requireTenantId();
    // Cifra segredos novos (em branco = mantém o salvo; null explícito limpa).
    const patch: Record<string, unknown> = { ...data };
    if (data.apiKey !== undefined) {
      patch.apiKey = data.apiKey ? encryptSecret(data.apiKey) : null;
    }
    if (data.webhookSecret !== undefined) {
      patch.webhookSecret = data.webhookSecret ? encryptSecret(data.webhookSecret) : null;
    }
    await prisma.fiscalSetting.upsert({ where: { tenantId }, create: { tenantId, ...patch }, update: { ...patch } });
    return this.getSettings();
  }

  async findDocumentByInvoice(invoiceId: string) {
    return prisma.fiscalDocument.findFirst({ where: { invoiceId, tenantId: requireTenantId() } });
  }

  /** Dados da fatura + tomador (cliente) para emitir. null se a fatura não é do tenant. */
  async getInvoiceForEmission(invoiceId: string) {
    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: requireTenantId() },
      select: {
        id: true, value: true, status: true, clientId: true,
        client: { select: { name: true, document: true, email: true } },
      },
    });
    if (!inv) return null;
    return {
      id: inv.id,
      amount: Number(inv.value),
      status: inv.status,
      clientId: inv.clientId,
      clientName: inv.client?.name ?? '',
      clientDocument: inv.client?.document ?? '',
      clientEmail: inv.client?.email ?? undefined,
    };
  }

  /** Cross-tenant: resolve a nota pelo id do provider (webhook). Sem contexto. */
  async findDocumentByProviderId(providerId: string) {
    return prisma.fiscalDocument.findFirst({ where: { providerId } });
  }

  async createDocument(data: {
    invoiceId: string;
    clientId: string;
    amountCents: number;
    provider: string;
    status: string;
    providerId?: string | null;
    number?: string | null;
    pdfUrl?: string | null;
    xmlUrl?: string | null;
    message?: string | null;
    issuedAt?: Date | null;
  }) {
    return prisma.fiscalDocument.create({ data: { ...data, tenantId: requireTenantId() } });
  }

  async updateDocument(id: string, data: Record<string, unknown>) {
    return prisma.fiscalDocument.update({ where: { id }, data });
  }

  async list(limit = 100) {
    const rows = await prisma.fiscalDocument.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
      include: { client: { select: { name: true } } },
    });
    return rows.map((d) => ({
      id: d.id, invoiceId: d.invoiceId, clientName: d.client?.name ?? '—',
      status: d.status, number: d.number, pdfUrl: d.pdfUrl, xmlUrl: d.xmlUrl,
      message: d.message, amountCents: d.amountCents, createdAt: d.createdAt,
    }));
  }
}
