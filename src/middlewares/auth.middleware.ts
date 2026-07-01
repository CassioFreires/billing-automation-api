import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.config.js';

export interface AuthPayload extends jwt.JwtPayload {
  role?: string;
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

  try {
    const payload = jwt.verify(token, authConfig.jwtSecret) as AuthPayload;
    (req as Request & { auth?: AuthPayload }).auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
