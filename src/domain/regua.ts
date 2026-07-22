/**
 * Régua de cobrança multi-passo (spec 0026) — lógica PURA (sem I/O).
 *
 * Um passo tem `offsetDays` relativo ao vencimento (negativo = antes, 0 = no dia,
 * positivo = depois) e uma `message` opcional (com variáveis {nome}/{valor}).
 */
export interface ReguaStep {
  offsetDays: number;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Régua padrão sugerida quando o tenant ainda não configurou. */
export const DEFAULT_REGUA_STEPS: ReguaStep[] = [
  { offsetDays: -3, message: 'Olá {nome}, sua cobrança de {valor} vence em 3 dias.' },
  { offsetDays: 0, message: 'Olá {nome}, sua cobrança de {valor} vence hoje.' },
  { offsetDays: 3, message: 'Olá {nome}, sua cobrança de {valor} está vencida há 3 dias.' },
  { offsetDays: 7, message: 'Olá {nome}, ainda não identificamos o pagamento de {valor}.' },
];

/** Dias decorridos desde o vencimento (pode ser negativo se ainda vai vencer). */
export function daysFromDue(now: Date, dueDate: Date): number {
  const diff = now.getTime() - dueDate.getTime();
  return Math.floor(diff / DAY_MS);
}

/**
 * Decide qual passo enviar AGORA para uma fatura (RN-2603):
 * o PRÓXIMO passo não enviado (índice = reminderStep) cujo offset já é devido
 * (`offsetDays <= diasDesdeVencimento`). Retorna o número do passo (1-based) ou
 * `null` se nenhum passo está devido.
 *
 * `offsets` deve estar ordenado por offset crescente (garantido pela validação).
 */
export function selectDueStep(
  offsets: number[],
  daysFromDueValue: number,
  reminderStep: number
): number | null {
  const nextIndex = reminderStep; // 0-based índice do próximo passo a enviar
  if (nextIndex < 0 || nextIndex >= offsets.length) return null;
  if (offsets[nextIndex] <= daysFromDueValue) {
    return nextIndex + 1; // 1-based
  }
  return null;
}

/** Substitui {nome} e {valor} na mensagem do passo. */
export function applyTemplate(
  message: string,
  vars: { nome: string; valor: number }
): string {
  const valorFmt = `R$ ${Number(vars.valor ?? 0).toFixed(2)}`;
  return message
    .replace(/\{nome\}/gi, vars.nome)
    .replace(/\{valor\}/gi, valorFmt);
}
