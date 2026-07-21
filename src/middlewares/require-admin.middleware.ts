import { Request, Response, NextFunction } from 'express';
import { isPlatformAdminEmail } from '../config/auth.config.js';
import { UserRepository } from '../repositories/user.repository.js';

const users = new UserRepository();

/**
 * Exige super-admin da plataforma (spec 0023). Roda APÓS `jwtAuth`: carrega o
 * usuário por `req.auth.sub` e confere se o e-mail está na allowlist
 * (`PLATFORM_ADMIN_EMAILS`). Não-admin → 403. Anexa `req.adminEmail`.
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as Request & { auth?: { sub?: string } }).auth;
  const sub = auth?.sub;
  if (!sub) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  users
    .findById(sub)
    .then((user) => {
      if (!user || !isPlatformAdminEmail(user.email)) {
        res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma' });
        return;
      }
      (req as Request & { adminEmail?: string }).adminEmail = user.email;
      next();
    })
    .catch(next);
}
