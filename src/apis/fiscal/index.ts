import { MockFiscalProvider } from './mock.provider.js';
import { NfeioFiscalProvider } from './nfeio.provider.js';

/**
 * NFS-e / Nota Fiscal (spec 0047, F7). SEAM do provider fiscal — espelha o seam de
 * pagamento (`apis/payment`). `mock` (padrão) roda o ciclo inteiro local sem conta
 * real; `nfeio` integra a NFE.io de verdade (por tenant). Trocar provider = trocar
 * só a config; o resto do sistema não muda.
 */

export interface EmitInput {
  reference: string; // nossa referência (id da fatura) — localizador no provider/webhook
  borrowerName: string;
  borrowerDocument: string; // CPF/CNPJ (só dígitos)
  borrowerEmail?: string;
  amount: number; // em reais
  description: string;
  cityServiceCode: string;
}

export interface EmitResult {
  providerId?: string;   // id da nota no provider
  status: string;        // status CRU do provider (None/Created/Issued/Cancelled/Error)
  number?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  message?: string;
}

export interface FiscalWebhookResult {
  reference?: string;    // nossa referência, se o provider devolver
  providerId?: string;
  status: string;        // status CRU do provider
  number?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  message?: string;
}

export interface FiscalProvider {
  /** Emite a nota. Pode ser síncrona (mock) ou assíncrona (nfeio → confirma por webhook). */
  emit(input: EmitInput): Promise<EmitResult>;
  /** Cancela a nota emitida no provider. */
  cancel(providerId: string): Promise<{ status: string; message?: string }>;
  /** Verifica e normaliza um webhook do provider. Retorna null se inválido/ignorado. */
  verifyWebhook(req: { headers: Record<string, unknown>; body: unknown; rawBody?: unknown }): FiscalWebhookResult | null;
}

export interface FiscalProviderConfig {
  provider: string; // mock | nfeio
  apiKey?: string | null;
  companyId?: string | null;
  webhookSecret?: string | null;
}

/** Resolve o provider fiscal a partir da config do tenant. Fallback: mock. */
export function resolveFiscalProvider(config: FiscalProviderConfig): FiscalProvider {
  switch (config.provider) {
    case 'nfeio':
      return new NfeioFiscalProvider({
        apiKey: config.apiKey ?? '',
        companyId: config.companyId ?? '',
        webhookSecret: config.webhookSecret ?? '',
      });
    case 'mock':
    default:
      return new MockFiscalProvider();
  }
}

/** Resolve por nome só para "espiar" o webhook (rota pública roteada por provider). */
export function resolveFiscalProviderByName(name: string): FiscalProvider {
  return resolveFiscalProvider({ provider: name });
}
