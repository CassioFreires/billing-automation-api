import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { authConfig } from '../config/auth.config.js';

/** Comparação resistente a timing attacks (não vaza o segredo pelo tempo de resposta). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Protege rotas de SISTEMA/cron (cross-tenant), como o agendador de cobrança
 * (spec 0010). Autentica por segredo `x-cron-secret` (= CRON_SECRET do ambiente),
 * NÃO por JWT de tenant — é uma operação que atravessa todos os tenants.
 * Falha fechado: sem CRON_SECRET no ambiente, a rota fica indisponível.
 */
export function cronAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authConfig.cronSecret) {
    console.error('❌ CRON_SECRET não configurado — rota de sistema indisponível');
    res.status(500).json({ error: 'Operação de sistema não configurada' });
    return;
  }

  const provided = req.header('x-cron-secret') ?? '';
  if (!provided || !safeEqual(provided, authConfig.cronSecret)) {
    res.status(401).json({ error: 'Segredo de sistema inválido' });
    return;
  }

  next();
}
