/**
 * Motor de recuperação de pagamento falho (spec 0033 — F1 "Guardião da Receita").
 * Fonte única da REGRA que decide o próximo passo de um caso de recuperação —
 * lógica pura e testável, sem I/O, no mesmo padrão de `domain/channels.ts`.
 *
 * A cada ciclo do sweep, o service monta o input (estado do caso + sinais do Elo +
 * config de alívio) e `decideNextStep` diz o que fazer:
 *   - remind         → reenviar o lembrete no canal atual
 *   - switch_channel → o último envio falhou: trocar de canal e reenviar (RN-3305)
 *   - offer_relief   → há hesitação: disparar o Botão de Alívio (RN-3304, spec 0018)
 *   - give_up        → passos esgotados: encerrar o caso como perdido (RN-3307)
 */

import type { DeliveryChannel } from './channels.js';

export const RECOVERY_ACTIONS = [
  'remind',
  'switch_channel',
  'offer_relief',
  'give_up',
] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

/** Config-padrão da sequência (v1; sequência por-tenant é follow-up). */
export const DEFAULT_MAX_STEPS = 4;
export const DEFAULT_STEP_INTERVAL_DAYS = 3;

export interface RecoveryDecisionInput {
  /** Passos já executados neste caso. */
  currentStep: number;
  /** Teto da sequência (após ele, desiste). */
  maxSteps: number;
  /** Canal do último envio (null se ainda não enviou). */
  lastChannel: DeliveryChannel | null;
  /** Canais disponíveis, em ordem de preferência (vindo de `resolveChannels`). */
  channels: DeliveryChannel[];
  /** Sinais de comportamento do Elo (spec 0016). */
  signals: {
    /** Quantidade de eventos `open` da fatura. */
    opens: number;
    /** Houve algum `pay_attempt`. */
    hadPayAttempt: boolean;
    /** O último envio falhou (result=failed). */
    lastSendFailed: boolean;
  };
  /** Config de autonegociação do tenant (spec 0018). */
  relief: {
    enabled: boolean;
    hesitationOpens: number;
    /** Já ofertou alívio neste caso (não repetir). */
    alreadyOffered: boolean;
  };
}

export interface RecoveryDecision {
  action: RecoveryAction;
  /** Canal a usar; null quando `give_up`. */
  channel: DeliveryChannel | null;
  /** Novo `currentStep` após esta ação. */
  nextStep: number;
  /** true quando a sequência se esgotou. */
  exhausted: boolean;
}

/** WhatsApp é sempre um destino válido (telefone é obrigatório no cliente). */
const FALLBACK_CHANNEL: DeliveryChannel = 'whatsapp';

/** Escolhe um canal diferente do último; se não houver, mantém o disponível. */
function pickAlternateChannel(
  channels: DeliveryChannel[],
  lastChannel: DeliveryChannel | null
): DeliveryChannel {
  const alternate = channels.find((c) => c !== lastChannel);
  return alternate ?? channels[0] ?? FALLBACK_CHANNEL;
}

/** Detecta hesitação: abriu o suficiente e não tentou pagar (RN-3304). */
function isHesitating(input: RecoveryDecisionInput): boolean {
  const { signals, relief } = input;
  return (
    relief.enabled &&
    !relief.alreadyOffered &&
    !signals.hadPayAttempt &&
    signals.opens >= relief.hesitationOpens
  );
}

/**
 * Decide o próximo passo de um caso de recuperação. Determinística e pura.
 * Prioridade: esgotou → oferta de alívio (hesitação) → troca de canal (falha) → lembrar.
 */
export function decideNextStep(input: RecoveryDecisionInput): RecoveryDecision {
  const preferred = input.channels[0] ?? FALLBACK_CHANNEL;

  // RN-3307: passos esgotados → desiste.
  if (input.currentStep >= input.maxSteps) {
    return { action: 'give_up', channel: null, nextStep: input.currentStep, exhausted: true };
  }

  const nextStep = input.currentStep + 1;

  // RN-3304: hesitação detectada → oferta de alívio (spec 0018).
  if (isHesitating(input)) {
    return { action: 'offer_relief', channel: preferred, nextStep, exhausted: false };
  }

  // RN-3305: último envio falhou → troca de canal antes de escalar.
  if (input.signals.lastSendFailed) {
    return {
      action: 'switch_channel',
      channel: pickAlternateChannel(input.channels, input.lastChannel),
      nextStep,
      exhausted: false,
    };
  }

  // Padrão: reenvia o lembrete no canal atual (ou o preferido).
  return {
    action: 'remind',
    channel: input.lastChannel ?? preferred,
    nextStep,
    exhausted: false,
  };
}
