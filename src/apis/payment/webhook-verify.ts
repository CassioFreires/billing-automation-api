import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookRequest } from './types.js';

/**
 * Utilidades de verificação de webhook compartilhadas pelos providers (spec 0019).
 * Centraliza HMAC/SHA-256 e comparação em tempo constante para não repetir a
 * lógica (e os erros) em cada gateway.
 *
 * ⚠️ CORPO CRU: alguns gateways (Stripe, Pagar.me) assinam o corpo HTTP EXATO
 * (byte a byte). Nossa camada HTTP entrega o corpo já parseado (`req.body`);
 * usamos `rawBody` quando o app o captura, caindo em `JSON.stringify(body)` no
 * resto. Em PRODUÇÃO, capturar o corpo cru nessas rotas é pré-requisito para a
 * assinatura casar (ver spec 0019 / D-23).
 */

/** Corpo cru para assinatura: usa `rawBody` capturado pelo app, senão serializa. */
export function rawBodyString(req: WebhookRequest): string {
  const raw = (req as { rawBody?: unknown }).rawBody;
  if (typeof raw === 'string') return raw;
  if (raw instanceof Buffer) return raw.toString('utf8');
  return JSON.stringify(req.body ?? {});
}

export function hmacHex(secret: string, payload: string, algo = 'sha256'): string {
  return createHmac(algo, secret).update(payload).digest('hex');
}

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/** Comparação em tempo constante de dois hex/strings (evita timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Lê um header (case-insensitive) como string, ou undefined. */
export function header(req: WebhookRequest, name: string): string | undefined {
  const direct = req.headers[name];
  if (typeof direct === 'string') return direct;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === lower && typeof v === 'string') return v;
  }
  return undefined;
}

/** Erro padrão de assinatura inválida (o controller mapeia para 401). */
export const INVALID_SIGNATURE = 'WEBHOOK_INVALID_SIGNATURE';
