/**
 * Lista do Dia — ranking da fila de ação (spec 0036, F3).
 *
 * Função PURA: recebe as faturas em aberto (com a faixa de saúde do Radar/F2 e se
 * há caso de recuperação/F1) e devolve os itens ORDENADOS por "dinheiro em risco":
 *
 *   priority = valor × pesoRisco(faixa) × severidade(diasAtraso)
 *
 * Transforma dado em decisão: o topo da lista é o que mais dói no bolso hoje.
 */

const DAY_MS = 86_400_000;
const UPCOMING_WINDOW_DAYS = 7; // vencimentos preventivos (a_vencer)
export const DEFAULT_ACTION_LIMIT = 12;

export type ActionKind = 'recuperar' | 'cobrar' | 'a_vencer';

export interface ActionCandidate {
  invoiceId: string;
  clientName: string;
  value: number;
  dueDate: Date;
  band: string | null; // faixa do Radar (F2): healthy | watch | at_risk | null
  hasCase: boolean; // já existe caso de recuperação (F1)?
}

export interface ActionItem {
  invoiceId: string;
  clientName: string;
  value: number;
  dueDate: Date;
  kind: ActionKind;
  band: string | null;
  diasAtraso: number; // >0 vencida; <=0 a vencer (dias até vencer, negativo)
  motivo: string;
  priority: number;
}

export interface RankedActions {
  itens: ActionItem[];
  total: number; // candidatos acionáveis (antes do corte)
  mostrando: number; // após o corte
}

/** Peso por faixa de saúde (RN-3602). Sem score → 0.5 (neutro). */
function bandWeight(band: string | null): number {
  switch (band) {
    case 'at_risk':
      return 1.0;
    case 'watch':
      return 0.75;
    default:
      return 0.5; // healthy ou sem score
  }
}

function bandLabel(band: string | null): string | null {
  switch (band) {
    case 'at_risk':
      return 'Em risco';
    case 'watch':
      return 'Atenção';
    case 'healthy':
      return 'Saudável';
    default:
      return null;
  }
}

/** Dias inteiros de atraso (>0) ou até vencer (<=0). */
function daysDiff(now: Date, dueDate: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);
}

/**
 * Ordena a fila de ação do dia. `now` injetável para teste. Vencidas entram como
 * `recuperar`/`cobrar`; o que vence nos próximos 7 dias entra como `a_vencer`
 * (peso preventivo menor); vencimentos além disso ficam de fora (RN-3603).
 */
export function rankDailyActions(
  candidates: ActionCandidate[],
  now: Date = new Date(),
  limit: number = DEFAULT_ACTION_LIMIT
): RankedActions {
  const itens: ActionItem[] = [];

  for (const c of candidates) {
    const dias = daysDiff(now, c.dueDate);
    const overdue = c.dueDate.getTime() < now.getTime();
    const bw = bandWeight(c.band);
    const label = bandLabel(c.band);

    if (overdue) {
      // Severidade cresce com o atraso e satura em ~60 dias (1.0 → 2.0).
      const severidade = 1 + Math.min(Math.max(dias, 0), 60) / 60;
      const kind: ActionKind = c.hasCase ? 'recuperar' : 'cobrar';
      const motivo =
        `Vencida há ${dias} dia${dias === 1 ? '' : 's'}` +
        (label ? ` · cliente ${label}` : '') +
        (c.hasCase ? ' · em recuperação' : '');
      itens.push({
        invoiceId: c.invoiceId,
        clientName: c.clientName,
        value: c.value,
        dueDate: c.dueDate,
        kind,
        band: c.band,
        diasAtraso: dias,
        motivo,
        priority: round2(c.value * bw * severidade),
      });
    } else {
      const ateVencer = -dias; // dias até vencer (>=0)
      if (ateVencer > UPCOMING_WINDOW_DAYS) continue; // não é ação de hoje
      const motivo =
        ateVencer === 0
          ? `Vence hoje` + (label ? ` · cliente ${label}` : '')
          : `Vence em ${ateVencer} dia${ateVencer === 1 ? '' : 's'}` + (label ? ` · cliente ${label}` : '');
      itens.push({
        invoiceId: c.invoiceId,
        clientName: c.clientName,
        value: c.value,
        dueDate: c.dueDate,
        kind: 'a_vencer',
        band: c.band,
        diasAtraso: dias,
        motivo,
        // Peso preventivo menor (0.3) — importa menos que uma já vencida.
        priority: round2(c.value * bw * 0.3),
      });
    }
  }

  itens.sort((a, b) => b.priority - a.priority);
  const total = itens.length;
  return { itens: itens.slice(0, limit), total, mostrando: Math.min(total, limit) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
