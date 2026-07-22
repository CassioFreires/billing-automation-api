import { describe, it, expect } from 'vitest';
import { resolveChannels, DEFAULT_NOTIFY_CHANNEL } from '../../src/domain/channels.js';

describe('resolveChannels (spec 0032)', () => {
  it('whatsapp → só WhatsApp (tenha e-mail ou não)', () => {
    expect(resolveChannels('whatsapp', { hasEmail: true })).toEqual(['whatsapp']);
    expect(resolveChannels('whatsapp', { hasEmail: false })).toEqual(['whatsapp']);
  });

  it('email com e-mail → só e-mail', () => {
    expect(resolveChannels('email', { hasEmail: true })).toEqual(['email']);
  });

  it('email SEM e-mail → fallback para WhatsApp', () => {
    expect(resolveChannels('email', { hasEmail: false })).toEqual(['whatsapp']);
  });

  it('both com e-mail → WhatsApp + e-mail (WhatsApp primeiro)', () => {
    expect(resolveChannels('both', { hasEmail: true })).toEqual(['whatsapp', 'email']);
  });

  it('both SEM e-mail → só WhatsApp', () => {
    expect(resolveChannels('both', { hasEmail: false })).toEqual(['whatsapp']);
  });

  it('nunca devolve lista vazia (o telefone é sempre um destino)', () => {
    for (const pref of ['whatsapp', 'email', 'both'] as const) {
      expect(resolveChannels(pref, { hasEmail: false }).length).toBeGreaterThan(0);
    }
  });

  it('default é whatsapp', () => {
    expect(DEFAULT_NOTIFY_CHANNEL).toBe('whatsapp');
  });
});
