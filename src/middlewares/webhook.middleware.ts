import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { authConfig } from '../config/auth.config.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica o segredo compartilhado do webhook em `x-webhook-secret`.
 *
 * Estruturado para evoluir para HMAC (assinatura do corpo) quando o gateway
 * real for integrado — bastaria trocar a comparação por uma verificação de
 * `crypto.createHmac('sha256', secret).update(rawBody)`.
 */
export function webhookAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!authConfig.webhookSecret) {
    console.error('❌ WEBHOOK_SECRET não configurado — webhook desprotegido');
    res.status(500).json({ error: 'Webhook não configurado' });
    return;
  }

  const provided = req.headers['x-webhook-secret'];

  if (typeof provided !== 'string' || !safeEqual(provided, authConfig.webhookSecret)) {
    res.status(401).json({ error: 'Assinatura do webhook inválida' });
    return;
  }

  next();
}
