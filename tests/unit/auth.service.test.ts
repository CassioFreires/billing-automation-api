import { describe, it, expect, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const ENV_KEYS = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'AUTH_USERNAME', 'AUTH_PASSWORD', 'DEFAULT_TENANT_ID'];
const original: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) original[k] = process.env[k];

/** authConfig captura o env no import → recarrega o módulo por cenário. */
async function loadService(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const { AuthService } = await import('../../src/services/auth.service.js');
  return new AuthService();
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('AuthService.login', () => {
  const validEnv = {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1h',
    AUTH_USERNAME: 'admin',
    AUTH_PASSWORD: 's3nha',
  };

  it('emite um JWT verificável (com tenantId) com credenciais válidas', async () => {
    const svc = await loadService({ ...validEnv, DEFAULT_TENANT_ID: 'tenant-xyz' });
    const { token, expiresIn } = svc.login({ username: 'admin', password: 's3nha' });

    expect(expiresIn).toBe('1h');
    const payload = jwt.verify(token, 'test-secret') as jwt.JwtPayload;
    expect(payload.sub).toBe('admin');
    expect(payload.role).toBe('service');
    expect((payload as any).tenantId).toBe('tenant-xyz');
  });

  it('lança INVALID_CREDENTIALS com senha errada', async () => {
    const svc = await loadService(validEnv);
    expect(() => svc.login({ username: 'admin', password: 'errada' })).toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('lança INVALID_CREDENTIALS com usuário errado', async () => {
    const svc = await loadService(validEnv);
    expect(() => svc.login({ username: 'root', password: 's3nha' })).toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('falha fechado quando JWT_SECRET ausente', async () => {
    const svc = await loadService({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 's3nha' });
    expect(() => svc.login({ username: 'admin', password: 's3nha' })).toThrow(
      'JWT_SECRET não configurado'
    );
  });

  it('lança AUTH_NOT_CONFIGURED quando credenciais ausentes', async () => {
    const svc = await loadService({ JWT_SECRET: 'test-secret' });
    expect(() => svc.login({ username: 'admin', password: 's3nha' })).toThrow(
      'AUTH_NOT_CONFIGURED'
    );
  });
});
