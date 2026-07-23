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
  RENEGOTIATED: 'RENEGOTIATED', // substituída por um acordo (spec 0018 — M2). Terminal.
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
  // Autonegociação (spec 0018): uma fatura em aberto pode ser RENEGOCIADA (o acordo
  // gera uma cobrança nova e "supersede" esta). RENEGOTIATED é terminal.
  PENDING: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.FAILED, InvoiceStatus.RENEGOTIATED],
  OVERDUE: [InvoiceStatus.PAID, InvoiceStatus.FAILED, InvoiceStatus.RENEGOTIATED],
  FAILED: [InvoiceStatus.PENDING, InvoiceStatus.PAID], // permite reprocessar
  PAID: [], // terminal
  RENEGOTIATED: [], // terminal — a cobrança viva agora é a nova fatura do acordo
};

/** true se a fatura pode ir de `from` para `to` (mesmo status = no-op ok). */
export function canTransitionInvoice(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = INVOICE_TRANSITIONS[from as InvoiceStatus];
  return allowed ? allowed.includes(to as InvoiceStatus) : false;
}

/**
 * Deve registrar um Payment(source=gateway) neste webhook? (RN-REC3, spec 0015)
 * Só na transição EFETIVA para PAID — evita duplicar o "dinheiro que entrou"
 * quando o gateway reconfirma um pagamento já registrado.
 */
export function shouldRecordGatewayPayment(
  previousStatus: string | null | undefined,
  newStatus: string
): boolean {
  return newStatus === InvoiceStatus.PAID && previousStatus !== InvoiceStatus.PAID;
}

/**
 * Status EFETIVO da fatura para EXIBIÇÃO (spec 0034). "Vencida" é um fato
 * DERIVADO da data — não um estado que precisa ser gravado/mantido por um job:
 *
 *   vencida = ainda não paga  E  a data de vencimento já passou.
 *
 * Regra: só uma fatura `PENDING` cuja `dueDate` já passou vira `OVERDUE` (na
 * leitura). Qualquer outro status (PAID/FAILED/RENEGOTIATED, ou OVERDUE já
 * persistido pelo sweep) é preservado. É a FONTE ÚNICA da verdade de "vencida",
 * reusada em todas as telas — some a defasagem entre Faturas e Cockpit.
 *
 * `now` é injetável para teste (função pura).
 */
export function effectiveInvoiceStatus(
  status: string,
  dueDate: Date | string | null | undefined,
  now: Date = new Date()
): string {
  if (status !== InvoiceStatus.PENDING || !dueDate) return status;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return status;
  return due.getTime() < now.getTime() ? InvoiceStatus.OVERDUE : status;
}
