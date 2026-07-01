import { describe, it, expect, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const original = process.env.JWT_SECRET;

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: any) => {
    res.body = b;
    return res;
  });
  return res as Response & { statusCode: number; body: any };
}

/** jwtAuth lê authConfig, capturado no import → recarrega por cenário. */
async function loadJwtAuth(secret?: string) {
  vi.resetModules();
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
  const mod = await import('../../src/middlewares/auth.middleware.js');
  return mod.jwtAuth;
}

afterEach(() => {
  if (original === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = original;
});

describe('jwtAuth middleware', () => {
  it('chama next() com token válido', async () => {
    const jwtAuth = await loadJwtAuth('sec');
    const token = jwt.sign({ sub: 'admin' }, 'sec');
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    jwtAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('401 quando o header está ausente', async () => {
    const jwtAuth = await loadJwtAuth('sec');
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('401 quando o token é inválido', async () => {
    const jwtAuth = await loadJwtAuth('sec');
    const token = jwt.sign({ sub: 'admin' }, 'sec');
    const req = { headers: { authorization: `Bearer ${token}corrompido` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('401 quando assinado com outro segredo', async () => {
    const jwtAuth = await loadJwtAuth('sec');
    const token = jwt.sign({ sub: 'admin' }, 'outro-segredo');
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    jwtAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });

  it('500 (fail-closed) quando JWT_SECRET não está configurado', async () => {
    const jwtAuth = await loadJwtAuth(undefined);
    const req = { headers: { authorization: 'Bearer qualquer' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    jwtAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
