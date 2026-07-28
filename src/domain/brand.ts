/**
 * White-label (spec 0050). Função PURA: valida/normaliza a cor de marca (hex).
 * Aceita #rgb ou #rrggbb (com/sem #), devolve sempre #rrggbb minúsculo.
 */

export const DEFAULT_BRAND_COLOR = '#14a08a';

export class BrandValidationError extends Error {}

export function normalizeBrandColor(input: string): string {
  const raw = (input ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    // #rgb → #rrggbb
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) {
    return `#${raw}`;
  }
  throw new BrandValidationError('Cor inválida — use um hex como #14a08a.');
}
