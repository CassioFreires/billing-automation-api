import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.config.js';
import { runWithTenant } from '../context/tenant-context.js';

export interface AuthPayload extends jwt.JwtPayload {
  role?: string;
  tenantId?: string;
}

/**
 * Exige um JWT válido em `Authorization: Bearer <token>`.
 * Anexa o payload decodificado em `req.auth`.
 */
export function jwtAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!authConfig.jwtSecret) {
    console.error('❌ JWT_SECRET não configurado — auth indisponível');
    res.status(500).json({ error: 'Autenticação não configurada' });
    return;
  }

  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, authConfig.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return;
  }

  if (!payload.tenantId) {
    res.status(401).json({ error: 'Token sem tenant' });
    return;
  }

  (req as Request & { auth?: AuthPayload }).auth = payload;

  // Toda a request roda dentro do contexto do tenant (multi-tenancy — spec 0001).
  runWithTenant(payload.tenantId, () => next());
}
