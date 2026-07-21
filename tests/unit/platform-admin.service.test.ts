import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-padm';
const { PlatformAdminService, PlatformAdminAuthError } = await import(
  '../../src/services/platform-admin.service.js'
);

function make(passwordHash?: string) {
  const repo = { findByEmail: vi.fn(), findById: vi.fn() };
  const service = new PlatformAdminService({ repo: repo as any });
  if (passwordHash) repo.findByEmail.mockResolvedValue({ id: 'adm1', email: 'a@x.com', name: 'Adm', role: 'SUPERADMIN', passwordHash });
  return { service, repo };
}

describe('PlatformAdminService.login (spec 0031)', () => {
  it('senha correta → token com scope=platform e SEM tenantId', async () => {
    const hash = await bcrypt.hash('senha123', 10);
    const { service } = make(hash);
    const res = await service.login('a@x.com', 'senha123');
    const decoded = jwt.verify(res.token, 'test-secret-padm') as any;
    expect(decoded.scope).toBe('platform');
    expect(decoded.tenantId).toBeUndefined();
    expect(decoded.sub).toBe('adm1');
    expect(res.admin.email).toBe('a@x.com');
  });

  it('senha errada → INVALID_CREDENTIALS', async () => {
    const hash = await bcrypt.hash('certa', 10);
    const { service } = make(hash);
    await expect(service.login('a@x.com', 'errada')).rejects.toBeInstanceOf(PlatformAdminAuthError);
  });

  it('e-mail inexistente → INVALID_CREDENTIALS', async () => {
    const { service, repo } = make();
    repo.findByEmail.mockResolvedValue(null);
    await expect(service.login('nao@existe.com', 'x')).rejects.toBeInstanceOf(PlatformAdminAuthError);
  });
});
