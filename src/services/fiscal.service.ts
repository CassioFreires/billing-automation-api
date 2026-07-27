import { FiscalRepository } from '../repositories/fiscal.repository.js';
import { runWithTenant } from '../context/tenant-context.js';
import {
  resolveFiscalProvider, resolveFiscalProviderByName,
  type FiscalProvider, type FiscalProviderConfig,
} from '../apis/fiscal/index.js';
import {
  mapProviderStatus, canTransitionFiscal, canCancelFiscal, validateEmission,
  type FiscalStatus,
} from '../domain/fiscal.js';

export class FiscalError extends Error {}
export const FE = {
  DISABLED: 'DISABLED',                 // → 409 (nota fiscal desligada no tenant)
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND', // → 404
  DOC_NOT_FOUND: 'DOC_NOT_FOUND',       // → 404 (sem nota pra cancelar)
  NOT_CANCELLABLE: 'NOT_CANCELLABLE',   // → 409 (só emitida cancela)
} as const;

const VALID_PROVIDERS = ['mock', 'nfeio'];

/**
 * NFS-e / Nota Fiscal (spec 0047, F7). Emite/cancela a nota via seam de provider
 * (mock por padrão; nfeio real por tenant). Opt-in: só roda se `enabled`. Emissão
 * manual (botão) e/ou automática ao receber (`autoEmitOnPaid`). Ciclo confirmado
 * síncrono (mock) ou por webhook (nfeio).
 */
export class FiscalService {
  private repo: FiscalRepository;
  private injectedProvider?: FiscalProvider;

  constructor(deps?: { repo?: FiscalRepository; provider?: FiscalProvider }) {
    this.repo = deps?.repo ?? new FiscalRepository();
    this.injectedProvider = deps?.provider;
  }

  private providerFor(config: FiscalProviderConfig): FiscalProvider {
    return this.injectedProvider ?? resolveFiscalProvider(config);
  }

  // --- Dono (JWT) ---
  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: {
    enabled?: boolean; provider?: string; apiKey?: string | null; webhookSecret?: string | null;
    companyId?: string | null; cityServiceCode?: string | null; autoEmitOnPaid?: boolean;
  }) {
    if (data.provider !== undefined && !VALID_PROVIDERS.includes(data.provider)) {
      throw new FiscalError('Provider fiscal inválido (use mock ou nfeio).');
    }
    return this.repo.upsertSettings(data);
  }

  async list() {
    return this.repo.list();
  }

  /**
   * Emite a NFS-e de uma fatura. Idempotente: se já há nota em processamento ou
   * emitida, devolve a existente; se deu erro/cancelou antes, reemite (mesmo doc).
   */
  async emitForInvoice(invoiceId: string, now: Date = new Date()) {
    const cfg = await this.repo.getSettingsForUse();
    if (!cfg || !cfg.enabled) throw new FiscalError(FE.DISABLED);

    const inv = await this.repo.getInvoiceForEmission(invoiceId);
    if (!inv) throw new FiscalError(FE.INVOICE_NOT_FOUND);

    const existing = await this.repo.findDocumentByInvoice(invoiceId);
    if (existing && (existing.status === 'issued' || existing.status === 'processing')) {
      return existing; // idempotente — não reemite o que está em andamento/emitido
    }

    const input = {
      reference: inv.id,
      borrowerName: inv.clientName,
      borrowerDocument: inv.clientDocument,
      borrowerEmail: inv.clientEmail,
      amount: inv.amount,
      description: `Serviço referente à cobrança ${inv.id.slice(0, 8)}`,
      cityServiceCode: cfg.cityServiceCode ?? '',
    };
    validateEmission(input); // lança FiscalValidationError

    const provider = this.providerFor({ provider: cfg.provider, apiKey: cfg.apiKey, companyId: cfg.companyId, webhookSecret: cfg.webhookSecret });
    const res = await provider.emit(input);
    const status = mapProviderStatus(res.status);

    const docData = {
      provider: cfg.provider,
      status,
      providerId: res.providerId ?? null,
      number: res.number ?? null,
      pdfUrl: res.pdfUrl ?? null,
      xmlUrl: res.xmlUrl ?? null,
      message: res.message ?? null,
      issuedAt: status === 'issued' ? now : null,
    };

    if (existing) return this.repo.updateDocument(existing.id, docData);
    return this.repo.createDocument({
      invoiceId: inv.id,
      clientId: inv.clientId,
      amountCents: Math.round(inv.amount * 100),
      ...docData,
    });
  }

  /** Cancela a nota de uma fatura (só se emitida). */
  async cancelForInvoice(invoiceId: string, now: Date = new Date()) {
    const doc = await this.repo.findDocumentByInvoice(invoiceId);
    if (!doc) throw new FiscalError(FE.DOC_NOT_FOUND);
    if (!canCancelFiscal(doc.status as FiscalStatus)) throw new FiscalError(FE.NOT_CANCELLABLE);

    const cfg = await this.repo.getSettingsForUse();
    const provider = this.providerFor({ provider: cfg?.provider ?? doc.provider, apiKey: cfg?.apiKey, companyId: cfg?.companyId, webhookSecret: cfg?.webhookSecret });
    const res = await provider.cancel(doc.providerId ?? '');
    return this.repo.updateDocument(doc.id, { status: mapProviderStatus(res.status), cancelledAt: now });
  }

  /**
   * Auto-emissão ao receber (chamado pelo InvoiceService no PAID). Só emite se o
   * tenant ligou `autoEmitOnPaid`. Best-effort: nunca derruba o webhook de pagamento.
   */
  async maybeAutoEmit(invoiceId: string, tenantId: string): Promise<void> {
    await runWithTenant(tenantId, async () => {
      const cfg = await this.repo.getSettingsForUse();
      if (!cfg || !cfg.enabled || !cfg.autoEmitOnPaid) return;
      await this.emitForInvoice(invoiceId).catch((err) => console.error('⚠️ Auto-emissão NFS-e falhou (segue):', err));
    });
  }

  /**
   * Webhook do provider (spec 0047). Resolve a nota pelo id do provider (cross-tenant),
   * verifica a assinatura no contexto do tenant e atualiza o status (com guarda de transição).
   */
  async applyWebhook(providerName: string, req: { headers: Record<string, unknown>; body: unknown; rawBody?: unknown }): Promise<{ ignored: boolean }> {
    const body = (req.body ?? {}) as { data?: { id?: string } };
    const providerId = body?.data?.id;
    if (!providerId) return { ignored: true };

    const doc = await this.repo.findDocumentByProviderId(providerId);
    if (!doc) return { ignored: true };

    return runWithTenant(doc.tenantId, async () => {
      const cfg = await this.repo.getSettingsForUse();
      const provider = this.providerFor({
        provider: cfg?.provider ?? providerName,
        apiKey: cfg?.apiKey, companyId: cfg?.companyId, webhookSecret: cfg?.webhookSecret,
      });
      const evt = provider.verifyWebhook(req);
      if (!evt) return { ignored: true };

      const status = mapProviderStatus(evt.status);
      if (!canTransitionFiscal(doc.status as FiscalStatus, status)) return { ignored: true };

      await this.repo.updateDocument(doc.id, {
        status,
        number: evt.number ?? doc.number,
        pdfUrl: evt.pdfUrl ?? doc.pdfUrl,
        xmlUrl: evt.xmlUrl ?? doc.xmlUrl,
        message: evt.message ?? doc.message,
        ...(status === 'issued' ? { issuedAt: new Date() } : {}),
        ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}),
      });
      return { ignored: false };
    });
  }
}
