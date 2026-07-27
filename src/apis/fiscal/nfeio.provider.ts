import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FiscalProvider, EmitInput, EmitResult, FiscalWebhookResult } from './index.js';

/**
 * Provider NFE.io (spec 0047). Integra a API REST de NFS-e da NFE.io conforme a
 * documentação oficial: emissão assíncrona (202 → confirma por webhook), cancelamento
 * e webhook assinado (`x-nfe-signature`, eventos invoice.issued/cancelled/error).
 *
 * ⚠️ Requer conta/apiKey/companyId reais para validar ponta a ponta. Enquanto isso,
 * o provider padrão do sistema é o `mock`. Base configurável por env (NFEIO_BASE_URL).
 */
export class NfeioFiscalProvider implements FiscalProvider {
  private apiKey: string;
  private companyId: string;
  private webhookSecret: string;
  private base: string;
  private timeoutMs = 8000;

  constructor(cfg: { apiKey: string; companyId: string; webhookSecret: string }) {
    this.apiKey = cfg.apiKey;
    this.companyId = cfg.companyId;
    this.webhookSecret = cfg.webhookSecret;
    this.base = (process.env.NFEIO_BASE_URL ?? 'https://api.nfe.io').replace(/\/$/, '');
  }

  private async call(path: string, init: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: { authorization: this.apiKey, 'content-type': 'application/json', ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(`NFE.io ${res.status}: ${text.slice(0, 200)}`);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async emit(input: EmitInput): Promise<EmitResult> {
    const body = {
      cityServiceCode: input.cityServiceCode,
      description: input.description,
      servicesAmount: input.amount,
      borrower: {
        federalTaxNumber: Number(input.borrowerDocument.replace(/\D/g, '')),
        name: input.borrowerName,
        ...(input.borrowerEmail ? { email: input.borrowerEmail } : {}),
      },
    };
    const inv = await this.call(`/v1/companies/${this.companyId}/serviceinvoices`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      providerId: inv?.id,
      status: inv?.status ?? 'Created', // assíncrono: normalmente Created/None → confirma no webhook
      number: inv?.number,
      pdfUrl: inv?.pdfUrl,
      xmlUrl: inv?.xmlUrl,
      message: inv?.flowMessage,
    };
  }

  async cancel(providerId: string): Promise<{ status: string; message?: string }> {
    await this.call(`/v1/companies/${this.companyId}/serviceinvoices/${providerId}`, { method: 'DELETE' });
    return { status: 'Cancelled' };
  }

  verifyWebhook(req: { headers: Record<string, unknown>; body: unknown; rawBody?: unknown }): FiscalWebhookResult | null {
    if (!this.webhookSecret) return null;
    const signature = String(req.headers['x-nfe-signature'] ?? req.headers['X-Nfe-Signature'] ?? '');
    const raw = typeof req.rawBody === 'string' ? req.rawBody
      : req.rawBody instanceof Buffer ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    const expected = createHmac('sha256', this.webhookSecret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = (req.body ?? {}) as { event?: string; data?: any };
    const data = payload.data ?? {};
    // O status pode vir no data.status; senão inferimos do evento.
    const status = data.status ?? (
      payload.event === 'invoice.issued' ? 'Issued' :
      payload.event === 'invoice.cancelled' ? 'Cancelled' :
      payload.event === 'invoice.error' ? 'Error' : 'None'
    );
    return {
      reference: data.externalId ?? data.reference,
      providerId: data.id,
      status,
      number: data.number,
      pdfUrl: data.pdfUrl,
      xmlUrl: data.xmlUrl,
      message: data.flowMessage,
    };
  }
}
