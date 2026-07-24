/**
 * Liga/Desliga o Acesso (spec 0042, F12). Função PURA que decide o estado de acesso
 * de um cliente a partir do pagamento — com TRAVAS de segurança fortes (bloquear é
 * sensível: um bloqueio errado é grave).
 *
 * Ordem das travas importa: override manual vence tudo; depois "desligado"; depois
 * "em dia"; depois "sem contrato" (não se bloqueia quem não assinou); só então a
 * carência decide grace vs blocked.
 */

export type AccessState = 'allowed' | 'grace' | 'blocked';
export type AccessOverride = 'allow' | 'block' | 'none' | null | undefined;

export interface AccessInput {
  enabled: boolean;
  hasOverdue: boolean;
  maxDaysOverdue: number;
  graceDays: number;
  requireSignedContract: boolean;
  contractAccepted: boolean;
  override: AccessOverride;
}

export interface AccessDecision {
  state: AccessState;
  granted: boolean; // acesso liberado? (grace também libera; só blocked nega)
  reason: string;
}

function decision(state: AccessState, reason: string): AccessDecision {
  return { state, granted: state !== 'blocked', reason };
}

export function decideAccess(input: AccessInput): AccessDecision {
  // Override manual do dono vence tudo (RN-4206).
  if (input.override === 'allow') return decision('allowed', 'Liberado manualmente pelo dono.');
  if (input.override === 'block') return decision('blocked', 'Bloqueado manualmente pelo dono.');

  // Controle desligado (RN-4203).
  if (!input.enabled) return decision('allowed', 'Controle de acesso desligado.');

  // Em dia — nunca bloqueia (RN-4202).
  if (!input.hasOverdue) return decision('allowed', 'Cliente em dia.');

  // Sem contrato assinado — não pode bloquear (RN-4204).
  if (input.requireSignedContract && !input.contractAccepted) {
    return decision('allowed', 'Sem contrato assinado — não é bloqueado.');
  }

  // Carência (RN-4205).
  if (input.maxDaysOverdue <= input.graceDays) {
    return decision('grace', `Em atraso, dentro da carência de ${input.graceDays} dia(s).`);
  }
  return decision('blocked', `Atraso de ${input.maxDaysOverdue} dias (acima da carência de ${input.graceDays}).`);
}
