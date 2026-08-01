import { Request, Response, NextFunction } from 'express';
import { ModuleEntitlementService } from '../services/module-entitlement.service.js';
import { ModuleKey, MODULES } from '../domain/modules.js';

/**
 * Gate de MÓDULO (spec 0051). Roda APÓS `jwtAuth` (tem contexto de tenant). Se o
 * tenant não tem o add-on, responde 402 { code: 'MODULE_NOT_ENABLED', module }.
 *
 * Isenta a conta de serviço (cron/worker, role 'service'). NÃO use em rotas
 * públicas/webhook (o pagador e o provider não têm tenant nem plano — RN-M5).
 *
 * Código 402 distinto de PLAN_EXPIRED: o front mostra upsell, não redireciona ao /plano.
 */
export function requireModule(key: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Request & { auth?: { role?: string } }).auth;
    if (auth?.role === 'service') return next();

    new ModuleEntitlementService()
      .has(key)
      .then((ok) => {
        if (ok) return next();
        res.status(402).json({
          error: `O módulo "${MODULES[key].label}" não está ativo na sua conta.`,
          code: 'MODULE_NOT_ENABLED',
          module: key,
        });
      })
      .catch(next);
  };
}
