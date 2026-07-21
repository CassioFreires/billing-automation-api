import { Request, Response, NextFunction } from 'express';
import { PlatformSubscriptionService } from '../services/platform-subscription.service.js';

/**
 * Gating da assinatura do SaaS (spec 0020): "bloqueia escrita + paywall".
 * Roda APÓS `jwtAuth` (tem contexto de tenant). Libera leitura (GET/HEAD/OPTIONS)
 * e a conta de serviço (role 'service' — cron/worker). Em ações de escrita sem
 * plano ativo → 402 { code: 'PLAN_EXPIRED' } (o front redireciona ao /plano).
 */
export function requireWriteAccess(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const auth = (req as Request & { auth?: { role?: string } }).auth;
  if (auth?.role === 'service') return next();

  new PlatformSubscriptionService()
    .entitlementsForCurrentTenant()
    .then((ent) => {
      if (ent.canWrite) return next();
      res.status(402).json({
        error: 'Seu período de teste/assinatura expirou. Faça upgrade para continuar.',
        code: 'PLAN_EXPIRED',
      });
    })
    .catch(next);
}

/**
 * Enforce da QUOTA de faturas do plano (spec 0020). Use em `POST /invoices`,
 * após `requireWriteAccess`. Estourou o limite do mês → 402 PLAN_LIMIT_REACHED.
 */
export function enforceInvoiceQuota(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as Request & { auth?: { role?: string } }).auth;
  if (auth?.role === 'service') return next();

  new PlatformSubscriptionService()
    .isInvoiceQuotaExceeded()
    .then((exceeded) => {
      if (!exceeded) return next();
      res.status(402).json({
        error: 'Você atingiu o limite de faturas do seu plano neste mês. Faça upgrade para emitir mais.',
        code: 'PLAN_LIMIT_REACHED',
      });
    })
    .catch(next);
}
