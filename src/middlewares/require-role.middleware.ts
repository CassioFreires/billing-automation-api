import { Request, Response, NextFunction } from 'express';
import { AuthPayload } from './auth.middleware.js';
import { Role } from '../domain/roles.js';

/**
 * Exige que o usuário do JWT tenha um dos papéis informados (spec 0030).
 * Deve rodar DEPOIS de `jwtAuth` (que anexa `req.auth`).
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Request & { auth?: AuthPayload }).auth;
    const role = auth?.role;
    if (!role || !roles.includes(role as Role)) {
      res.status(403).json({ error: 'Sem permissão para esta ação.' });
      return;
    }
    next();
  };
}
