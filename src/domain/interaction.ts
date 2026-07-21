/**
 * Fonte única dos tipos de EVENTO DE INTERAÇÃO e CANAIS (spec 0016 — Fundação
 * "Elo"). Centraliza as "magic strings" do comportamento do pagador, no mesmo
 * padrão de `domain/status.ts` (D-07). Enquanto o schema guarda `type`/`channel`
 * como String, estes tipos/constantes são a referência da aplicação.
 *
 * (Conversão para enum NATIVO do Postgres é follow-up, junto de D-07.)
 */

export const InteractionType = {
  LINK_CREATED: 'link_created', // fatura criada com link próprio
  SENT: 'sent', // cobrança despachada (worker)
  DELIVERED: 'delivered', // entregue no canal (depende do webhook de status — D-02)
  READ: 'read', // lida no canal (D-02)
  FAILED: 'failed', // falha de entrega no canal (D-02)
  OPEN: 'open', // link próprio aberto (/r/:token)
  PAY_ATTEMPT: 'pay_attempt', // tentativa de pagar (preciso com a página própria — M2, spec 0018)
  RELIEF_OFFERED: 'relief_offered', // Botão de Alívio exibido ao pagador (M2, spec 0018)
  RELIEF_ACCEPTED: 'relief_accepted', // pagador aceitou uma opção de acordo (M2, spec 0018)
  PAID: 'paid', // pagamento confirmado (webhook)
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];

export const InteractionChannel = {
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  EMAIL: 'email',
  WEB: 'web',
} as const;
export type InteractionChannel = (typeof InteractionChannel)[keyof typeof InteractionChannel];

/**
 * Semente da autonegociação (M2, RN-ELO9): quantas aberturas sem pagamento
 * disparam o "Botão de Alívio de Caixa". A regra em si (a oferta) é do M2; aqui
 * só definimos o limiar padrão que o Cockpit/regra vão consultar.
 */
export const DEFAULT_HESITATION_OPENS = 3;

/**
 * Dado as contagens por tipo de uma fatura, o pagador está "em dúvida"?
 * (abriu o link >= N vezes e ainda não pagou). Função pura — testável.
 */
export function isHesitating(
  counts: Partial<Record<InteractionType, number>>,
  threshold: number = DEFAULT_HESITATION_OPENS
): boolean {
  const opens = counts[InteractionType.OPEN] ?? 0;
  const paid = counts[InteractionType.PAID] ?? 0;
  return paid === 0 && opens >= threshold;
}
