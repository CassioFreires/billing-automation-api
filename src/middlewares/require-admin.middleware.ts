import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.config.js';
import { PlatformAdminRepository } from '../repositories/platform-admin.repository.js';

const admins = new PlatformAdminRepository();

interface PlatformClaims extends jwt.JwtPayload {
  scope?: string;
  role?: string;
}

/**
 * Exige um token de PLATAFORMA (spec 0031): JWT válido com `scope:'platform'`
 * (emitido só pelo login do console) e um PlatformAdmin existente. Um token de
 * tenant (sem scope) é REJEITADO — isolamento real entre console e app do cliente.
 * Anexa `req.admin`.
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!authConfig.jwtSecret) {
    res.status(500).json({ error: 'Autenticação não configurada' });
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  let payload: PlatformClaims;
  try {
    payload = jwt.verify(header.slice('Bearer '.length).trim(), authConfig.jwtSecret) as PlatformClaims;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return;
  }

  if (payload.scope !== 'platform' || !payload.sub) {
    res.status(403).json({ error: 'Acesso restrito ao console da plataforma' });
    return;
  }

  admins
    .findById(payload.sub)
    .then((admin) => {
      if (!admin) {
        res.status(403).json({ error: 'Administrador não encontrado' });
        return;
      }
      (req as Request & { admin?: { id: string; email: string; name: string; role: string } }).admin = {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      };
      next();
    })
    .catch(next);
}
