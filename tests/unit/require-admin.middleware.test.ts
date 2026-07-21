import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const h = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('../../src/repositories/platform-admin.repository.js', () => ({
  PlatformAdminRepository: class {
    findById = h.findById;
  },
}));

process.env.JWT_SECRET = 'test-secret-console';
const { requirePlatformAdmin } = await import('../../src/middlewares/require-admin.middleware.js');

const SECRET = 'test-secret-console';
const platformToken = () => jwt.sign({ sub: 'adm1', scope: 'platform', role: 'SUPERADMIN' }, SECRET, { expiresIn: '1h' });
const tenantToken = () => jwt.sign({ sub: 'u1', role: 'OWNER', tenantId: 't1' }, SECRET, { expiresIn: '1h' });

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => h.findById.mockReset());

describe('requirePlatformAdmin (spec 0031)', () => {
  it('token de plataforma + admin existente → next + req.admin', async () => {
    h.findById.mockResolvedValue({ id: 'adm1', email: 'a@x.com', name: 'Adm', role: 'SUPERADMIN' });
    const req: any = { headers: { authorization: `Bearer ${platformToken()}` } };
    const next = vi.fn();
    requirePlatformAdmin(req, res() as any, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalled();
    expect(req.admin.email).toBe('a@x.com');
  });

  it('token de TENANT (sem scope) → 403 (isolamento)', async () => {
    const r = res();
    const next = vi.fn();
    requirePlatformAdmin({ headers: { authorization: `Bearer ${tenantToken()}` } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('scope platform mas admin removido → 403', async () => {
    h.findById.mockResolvedValue(null);
    const r = res();
    const next = vi.fn();
    requirePlatformAdmin({ headers: { authorization: `Bearer ${platformToken()}` } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('sem token → 401', () => {
    const r = res();
    requirePlatformAdmin({ headers: {} } as any, r as any, vi.fn());
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('token inválido → 401', () => {
    const r = res();
    requirePlatformAdmin({ headers: { authorization: 'Bearer lixo' } } as any, r as any, vi.fn());
    expect(r.status).toHaveBeenCalledWith(401);
  });
});
