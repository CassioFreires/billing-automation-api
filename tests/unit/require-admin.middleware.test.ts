import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: class {
    findById = h.findById;
  },
}));

// Allowlist definida ANTES de importar a config/middleware (lida no import).
process.env.PLATFORM_ADMIN_EMAILS = 'admin@x.com, boss@x.com';
const { requirePlatformAdmin } = await import('../../src/middlewares/require-admin.middleware.js');

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => h.findById.mockReset());

describe('requirePlatformAdmin (spec 0023)', () => {
  it('e-mail na allowlist → next + anexa adminEmail', async () => {
    h.findById.mockResolvedValue({ id: 'u1', email: 'Admin@X.com' }); // case-insensitive
    const next = vi.fn();
    const req: any = { auth: { sub: 'u1' } };
    requirePlatformAdmin(req, res() as any, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalled();
    expect(req.adminEmail).toBe('Admin@X.com');
  });

  it('e-mail fora da allowlist → 403', async () => {
    h.findById.mockResolvedValue({ id: 'u2', email: 'alguem@outro.com' });
    const next = vi.fn();
    const r = res();
    requirePlatformAdmin({ auth: { sub: 'u2' } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('sem usuário (token órfão) → 403', async () => {
    h.findById.mockResolvedValue(null);
    const next = vi.fn();
    const r = res();
    requirePlatformAdmin({ auth: { sub: 'nope' } } as any, r as any, next);
    await new Promise((res) => setTimeout(res, 0));
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('sem sub → 401', () => {
    const next = vi.fn();
    const r = res();
    requirePlatformAdmin({} as any, r as any, next);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
