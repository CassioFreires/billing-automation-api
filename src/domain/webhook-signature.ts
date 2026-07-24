import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Conexão IoT/Catracas (spec 0043, F13). Assinatura dos webhooks de SAÍDA — a
 * trava de segurança que deixa o sistema do cliente (catraca, streaming) provar
 * que o disparo veio MESMO do Adimplo, e não de um impostor.
 *
 * Assinamos `${timestamp}.${body}` (não só o body) para que a assinatura também
 * ampare o timestamp e o receptor possa rejeitar disparos velhos (anti-replay).
 * Espelha o padrão dos webhooks de ENTRADA (apis/payment/webhook-verify).
 */

const HEADER_SIG = 'x-adimplo-signature';
const HEADER_TS = 'x-adimplo-timestamp';

/** HMAC-SHA256 hex de `${timestamp}.${body}` com o segredo do tenant. */
export function signWebhook(secret: string, body: string, timestampMs: number): string {
  return createHmac('sha256', secret).update(`${timestampMs}.${body}`).digest('hex');
}

/** Headers de assinatura para anexar ao POST de saída. */
export function signatureHeaders(secret: string, body: string, timestampMs: number): Record<string, string> {
  return {
    [HEADER_TS]: String(timestampMs),
    [HEADER_SIG]: `sha256=${signWebhook(secret, body, timestampMs)}`,
  };
}

/**
 * Verifica um par (assinatura, timestamp) contra o corpo. Usado nos testes e por
 * quem quiser validar do lado receptor. `toleranceMs` rejeita disparos muito
 * antigos (anti-replay); passe 0 para desligar a checagem de janela.
 */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  timestampMs: number,
  now: number,
  toleranceMs = 5 * 60_000,
): boolean {
  if (toleranceMs > 0 && Math.abs(now - timestampMs) > toleranceMs) return false;
  const expected = `sha256=${signWebhook(secret, body, timestampMs)}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const WEBHOOK_HEADERS = { signature: HEADER_SIG, timestamp: HEADER_TS } as const;
