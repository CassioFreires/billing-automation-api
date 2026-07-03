/**
 * Utilitários de datas para cobrança recorrente (spec 0009).
 * dayOfMonth é sempre 1..28 (garantido pelo DTO), então não há mês sem o dia.
 */

/** Competência no formato "YYYY-MM" (usada como chave de idempotência). */
export function periodOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Data (UTC) do dia `dayOfMonth` no mês/ano informados. */
function dateAt(year: number, month: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(year, month, dayOfMonth, 0, 0, 0, 0));
}

/**
 * Primeiro vencimento a partir de `from`: o `dayOfMonth` do mês corrente se
 * ainda não passou; senão, o `dayOfMonth` do mês seguinte.
 */
export function firstRunDate(dayOfMonth: number, from: Date): Date {
  const candidate = dateAt(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth);
  if (candidate.getTime() >= startOfDay(from).getTime()) {
    return candidate;
  }
  return dateAt(from.getUTCFullYear(), from.getUTCMonth() + 1, dayOfMonth);
}

/** Mesmo dia do mês, um mês adiante. */
export function nextMonth(date: Date, dayOfMonth: number): Date {
  return dateAt(date.getUTCFullYear(), date.getUTCMonth() + 1, dayOfMonth);
}

/** Zera horas (UTC) para comparar apenas a data. */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
