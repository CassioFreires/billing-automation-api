import { describe, it, expect } from 'vitest';
import { decideNextStep, type RecoveryDecisionInput } from '../../src/domain/recovery.js';

// Base "saudável": 1 canal (whatsapp), sem sinais, alívio ligado mas sem hesitação.
function base(overrides: Partial<RecoveryDecisionInput> = {}): RecoveryDecisionInput {
  return {
    currentStep: 0,
    maxSteps: 4,
    lastChannel: null,
    channels: ['whatsapp'],
    signals: { opens: 0, hadPayAttempt: false, lastSendFailed: false },
    relief: { enabled: true, hesitationOpens: 3, alreadyOffered: false },
    ...overrides,
  };
}

describe('decideNextStep (spec 0033 — F1)', () => {
  it('esgotou os passos → give_up (RN-3307)', () => {
    const d = decideNextStep(base({ currentStep: 4, maxSteps: 4 }));
    expect(d.action).toBe('give_up');
    expect(d.exhausted).toBe(true);
    expect(d.channel).toBeNull();
  });

  it('sem sinais → remind no canal preferido, avança o passo', () => {
    const d = decideNextStep(base());
    expect(d.action).toBe('remind');
    expect(d.channel).toBe('whatsapp');
    expect(d.nextStep).toBe(1);
    expect(d.exhausted).toBe(false);
  });

  it('mantém o último canal no remind', () => {
    const d = decideNextStep(base({ channels: ['email', 'whatsapp'], lastChannel: 'email' }));
    expect(d.action).toBe('remind');
    expect(d.channel).toBe('email');
  });

  it('hesitação (opens>=limiar, sem pay_attempt, alívio ligado) → offer_relief (RN-3304)', () => {
    const d = decideNextStep(base({ signals: { opens: 3, hadPayAttempt: false, lastSendFailed: false } }));
    expect(d.action).toBe('offer_relief');
    expect(d.channel).toBe('whatsapp');
  });

  it('não oferta alívio se houve pay_attempt', () => {
    const d = decideNextStep(base({ signals: { opens: 5, hadPayAttempt: true, lastSendFailed: false } }));
    expect(d.action).toBe('remind');
  });

  it('não oferta alívio se desligado no tenant', () => {
    const d = decideNextStep(
      base({ signals: { opens: 9, hadPayAttempt: false, lastSendFailed: false },
             relief: { enabled: false, hesitationOpens: 3, alreadyOffered: false } })
    );
    expect(d.action).toBe('remind');
  });

  it('não repete alívio já ofertado', () => {
    const d = decideNextStep(
      base({ signals: { opens: 9, hadPayAttempt: false, lastSendFailed: false },
             relief: { enabled: true, hesitationOpens: 3, alreadyOffered: true } })
    );
    expect(d.action).not.toBe('offer_relief');
  });

  it('envio falhou → switch_channel para um canal alternativo (RN-3305)', () => {
    const d = decideNextStep(
      base({ channels: ['whatsapp', 'email'], lastChannel: 'whatsapp',
             signals: { opens: 0, hadPayAttempt: false, lastSendFailed: true } })
    );
    expect(d.action).toBe('switch_channel');
    expect(d.channel).toBe('email');
  });

  it('falha mas só há um canal → mantém o disponível', () => {
    const d = decideNextStep(
      base({ channels: ['whatsapp'], lastChannel: 'whatsapp',
             signals: { opens: 0, hadPayAttempt: false, lastSendFailed: true } })
    );
    expect(d.action).toBe('switch_channel');
    expect(d.channel).toBe('whatsapp');
  });

  it('hesitação tem prioridade sobre falha de envio', () => {
    const d = decideNextStep(
      base({ channels: ['whatsapp', 'email'], lastChannel: 'whatsapp',
             signals: { opens: 4, hadPayAttempt: false, lastSendFailed: true } })
    );
    expect(d.action).toBe('offer_relief');
  });
});
