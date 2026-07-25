/**
 * Winback / reativação (spec 0045, F5). Funções PURAS: quando um cliente perdido
 * deve receber a oferta de retorno, quanto cobrar com o desconto, e o texto.
 * Sem I/O — testável isoladamente.
 */

export const DEFAULT_WINBACK_DAYS = 15;
export const DEFAULT_WINBACK_DISCOUNT = 10;

const DAY_MS = 86_400_000;

/** Limita o desconto a 0..90 (não faz sentido dar >90% pra reativar). */
export function clampWinbackDiscount(percent: number): number {
  return Math.max(0, Math.min(90, Math.round(percent)));
}

/** Limita a janela a 0..180 dias após a saída. */
export function clampWinbackDays(days: number): number {
  return Math.max(0, Math.min(180, Math.round(days)));
}

/**
 * O caso está "vencido" para disparo quando já se passaram `daysAfter` dias desde
 * que o cliente ficou elegível (virou perdido/cancelado e foi inscrito no winback).
 */
export function isDueForWinback(eligibleAt: Date, daysAfter: number, now: Date): boolean {
  const elapsedDays = (now.getTime() - eligibleAt.getTime()) / DAY_MS;
  return elapsedDays >= daysAfter;
}

/** Valor da cobrança de retorno (em reais) a partir do valor da assinatura + desconto. */
export function winbackChargeValue(amount: number, discountPercent: number): number {
  const pct = clampWinbackDiscount(discountPercent);
  const value = amount * (1 - pct / 100);
  // 2 casas, nunca negativo.
  return Math.max(0, Math.round(value * 100) / 100);
}

/**
 * Mensagem da oferta de retorno. Usa o template do dono se houver (com placeholders
 * {nome}, {valor}, {desconto}); senão, um texto padrão de "sentimos sua falta".
 */
export function buildWinbackMessage(
  name: string,
  value: number,
  discountPercent: number,
  template?: string | null,
): string {
  const valor = `R$ ${value.toFixed(2)}`;
  const desconto = `${clampWinbackDiscount(discountPercent)}%`;
  if (template && template.trim()) {
    return template
      .replaceAll('{nome}', name)
      .replaceAll('{valor}', valor)
      .replaceAll('{desconto}', desconto)
      .trim();
  }
  return `Olá ${name}, sentimos sua falta! Volte com ${desconto} de desconto: sua 1ª mensalidade sai por ${valor}. É só pagar pelo link:`;
}
