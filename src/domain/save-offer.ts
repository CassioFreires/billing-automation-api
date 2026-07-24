/**
 * Segura Quem Quer Sair — recomendação de oferta de retenção (spec 0037, F11).
 *
 * Função PURA: dado o MOTIVO do cancelamento e a SAÚDE do cliente (faixa do Radar/
 * F2), recomenda a melhor saída para reter sem queimar margem à toa.
 *
 * Regra-chave (RN-3702): "pausar" é a saída preferida — retém o cliente sem perder
 * receita futura; só oferece desconto quando o motivo é preço E o cliente não é de
 * alto risco (não vale dar desconto para quem provavelmente sairia mesmo assim).
 */

export type CancellationReason = 'preco' | 'nao_uso' | 'mudanca' | 'insatisfacao' | 'outro';
export type SaveOffer = 'pause' | 'discount' | 'downgrade' | 'winback_later';

export interface SaveOfferDecision {
  offer: SaveOffer;
  message: string;
}

const MESSAGES: Record<SaveOffer, string> = {
  pause: 'Que tal pausar por um tempo? Sua vaga fica guardada e você volta quando quiser.',
  discount: 'Podemos aplicar um desconto temporário para você continuar com a gente.',
  downgrade: 'Que tal um plano mais enxuto? Você mantém o essencial pagando menos.',
  winback_later: 'Sem problema — guardamos seus dados e avisamos com uma condição especial quando quiser voltar.',
};

/**
 * Recomenda a oferta. `healthBand` (F2) refina: cliente `at_risk` puxa para
 * `pause` (retém sem custo de margem) mesmo quando o motivo sugeriria desconto.
 */
export function decideSaveOffer(
  reason: CancellationReason | string | null | undefined,
  healthBand?: string | null
): SaveOfferDecision {
  const atRisk = healthBand === 'at_risk';

  let offer: SaveOffer;
  switch (reason) {
    case 'preco':
      // Preço: desconto — mas não "queima" margem com quem já está de saída (at_risk).
      offer = atRisk ? 'pause' : 'discount';
      break;
    case 'nao_uso':
      offer = 'pause';
      break;
    case 'mudanca':
      offer = 'winback_later';
      break;
    case 'insatisfacao':
      offer = 'downgrade';
      break;
    default:
      offer = 'pause'; // 'outro'/desconhecido → default seguro
  }

  return { offer, message: MESSAGES[offer] };
}

// ── Desconto de retenção (spec 0038, F11.1) — funções puras ──────────────────

/** true se há um desconto válido para a data `on` (competência). */
export function isDiscountActive(
  discountUntil: Date | null | undefined,
  on: Date = new Date()
): boolean {
  return !!discountUntil && on.getTime() <= discountUntil.getTime();
}

/** Aplica o percentual (0..100) ao valor, com 2 casas. Percentual inválido = sem desconto. */
export function applyDiscount(amount: number, percent: number | null | undefined): number {
  if (!percent || percent <= 0 || percent > 100) return round2(amount);
  return round2(amount * (1 - percent / 100));
}

/** Soma meses a uma data (base para `discountUntil`). Não muta a original. */
export function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
