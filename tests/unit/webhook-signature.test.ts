import { describe, it, expect } from 'vitest';
import { signWebhook, signatureHeaders, verifyWebhook, WEBHOOK_HEADERS } from '../../src/domain/webhook-signature.js';

const SECRET = 'whsec_test_123';
const BODY = JSON.stringify({ clientId: 'c1', state: 'blocked', granted: false });
const TS = 1_700_000_000_000;

describe('webhook-signature (spec 0043 — F13)', () => {
  it('assina de forma determinística (mesmo input → mesma assinatura)', () => {
    expect(signWebhook(SECRET, BODY, TS)).toBe(signWebhook(SECRET, BODY, TS));
  });

  it('assinatura muda se o corpo, o timestamp ou o segredo mudam', () => {
    const base = signWebhook(SECRET, BODY, TS);
    expect(signWebhook(SECRET, BODY + ' ', TS)).not.toBe(base);
    expect(signWebhook(SECRET, BODY, TS + 1)).not.toBe(base);
    expect(signWebhook('outro', BODY, TS)).not.toBe(base);
  });

  it('signatureHeaders traz timestamp e assinatura prefixada com sha256=', () => {
    const h = signatureHeaders(SECRET, BODY, TS);
    expect(h[WEBHOOK_HEADERS.timestamp]).toBe(String(TS));
    expect(h[WEBHOOK_HEADERS.signature]).toBe(`sha256=${signWebhook(SECRET, BODY, TS)}`);
  });

  it('verifyWebhook aceita a assinatura correta dentro da janela', () => {
    const h = signatureHeaders(SECRET, BODY, TS);
    expect(verifyWebhook(SECRET, BODY, h[WEBHOOK_HEADERS.signature], TS, TS + 1000)).toBe(true);
  });

  it('verifyWebhook rejeita assinatura adulterada', () => {
    expect(verifyWebhook(SECRET, BODY, 'sha256=deadbeef', TS, TS)).toBe(false);
  });

  it('verifyWebhook rejeita segredo errado', () => {
    const h = signatureHeaders('errado', BODY, TS);
    expect(verifyWebhook(SECRET, BODY, h[WEBHOOK_HEADERS.signature], TS, TS)).toBe(false);
  });

  it('verifyWebhook rejeita disparo fora da janela de tolerância (anti-replay)', () => {
    const h = signatureHeaders(SECRET, BODY, TS);
    // 10 min depois, tolerância padrão 5 min → rejeita
    expect(verifyWebhook(SECRET, BODY, h[WEBHOOK_HEADERS.signature], TS, TS + 10 * 60_000)).toBe(false);
  });

  it('toleranceMs=0 desliga a janela (só valida a assinatura)', () => {
    const h = signatureHeaders(SECRET, BODY, TS);
    expect(verifyWebhook(SECRET, BODY, h[WEBHOOK_HEADERS.signature], TS, TS + 10 * 60_000, 0)).toBe(true);
  });
});
