/**
 * Fonte única dos status do domínio (D-07). Centraliza as "magic strings" e
 * define a máquina de estados da fatura. Enquanto o schema ainda guarda `status`
 * como String, estes tipos/constantes são a referência da aplicação.
 *
 * (A conversão para enum NATIVO do Postgres é um passo à parte — ver tech-debt
 * D-07 / production-readiness PR-15 — por causa do efeito cascata de tipos.)
 */

export const InvoiceStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  FAILED: 'FAILED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const ClientStatus = {
  EM_DIA: 'EM_DIA',
  EM_ATRASO: 'EM_ATRASO',
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CANCELED: 'CANCELED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/**
 * Máquina de estados da FATURA. Transições permitidas a partir de cada status.
 * Regra-chave: `PAID` é **terminal** (não regride) — protege contra eventos de
 * webhook fora de ordem (RN-P7). A transição para o MESMO status é sempre um
 * no-op permitido (idempotência).
 */
const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  PENDING: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.FAILED],
  OVERDUE: [InvoiceStatus.PAID, InvoiceStatus.FAILED],
  FAILED: [InvoiceStatus.PENDING, InvoiceStatus.PAID], // permite reprocessar
  PAID: [], // terminal
};

/** true se a fatura pode ir de `from` para `to` (mesmo status = no-op ok). */
export function canTransitionInvoice(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = INVOICE_TRANSITIONS[from as InvoiceStatus];
  return allowed ? allowed.includes(to as InvoiceStatus) : false;
}
