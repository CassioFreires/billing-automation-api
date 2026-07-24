/**
 * Loja no Pagamento (spec 0044, F15). Funções PURAS da oferta ("order bump"):
 * validar/normalizar o produto e montar o rascunho da cobrança do add-on.
 * Sem I/O — testável isoladamente.
 */

export type OfferType = 'addon' | 'upgrade' | 'produto';
export const OFFER_TYPES: OfferType[] = ['addon', 'upgrade', 'produto'];

export const MAX_OFFER_PRICE_CENTS = 1_000_000_00; // teto de sanidade: R$ 1.000.000

export interface OfferInput {
  name: string;
  priceCents: number;
  type?: string;
  active?: boolean;
}

export interface NormalizedOffer {
  name: string;
  priceCents: number;
  type: OfferType;
  active: boolean;
}

export class OfferValidationError extends Error {}

/** Valida e normaliza os dados de uma oferta vindos do dono. Lança em dado inválido. */
export function normalizeOffer(input: OfferInput): NormalizedOffer {
  const name = (input.name ?? '').trim();
  if (name.length < 2) throw new OfferValidationError('Nome da oferta muito curto.');
  if (name.length > 120) throw new OfferValidationError('Nome da oferta muito longo (máx. 120).');

  const priceCents = Math.round(Number(input.priceCents));
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new OfferValidationError('Preço deve ser maior que zero.');
  }
  if (priceCents > MAX_OFFER_PRICE_CENTS) throw new OfferValidationError('Preço acima do limite.');

  const type = (input.type ?? 'addon') as OfferType;
  if (!OFFER_TYPES.includes(type)) throw new OfferValidationError('Tipo de oferta inválido.');

  return { name, priceCents, type, active: input.active ?? true };
}

export interface AddonChargeDraft {
  description: string;
  value: number; // em reais (o gateway e o Decimal trabalham em reais)
  dueDate: Date;
}

/**
 * Monta a cobrança do add-on aceito no checkout. Vence HOJE (compra por impulso —
 * paga agora, sem prazo). `value` em reais a partir dos centavos guardados.
 */
export function buildAddonCharge(offer: { name: string; priceCents: number }, now: Date): AddonChargeDraft {
  return {
    description: offer.name,
    value: offer.priceCents / 100,
    dueDate: now,
  };
}
