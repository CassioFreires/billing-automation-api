import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const h = vi.hoisted(() => ({ findOwnerByTenant: vi.fn() }));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: class {
    findOwnerByTenant = h.findOwnerByTenant;
  },
}));

process.env.JWT_SECRET = 'test-secret-imp';
const { AuthService } = await import('../../src/services/auth.service.js');

describe('AuthService.issueImpersonation (spec 0031)', () => {
  it('emite token de TENANT (scope tenant + tenantId alvo + imp)', async () => {
    h.findOwnerByTenant.mockResolvedValue({ id: 'owner1', role: 'OWNER' });
    const svc = new AuthService();
    const { token } = await svc.issueImpersonation('admin@x.com', 'tenantA');
    const decoded = jwt.verify(token, 'test-secret-imp') as any;
    expect(decoded.scope).toBe('tenant');
    expect(decoded.tenantId).toBe('tenantA');
    expect(decoded.sub).toBe('owner1');
    expect(decoded.imp).toBe('admin@x.com');
  });

  it('tenant sem OWNER → erro', async () => {
    h.findOwnerByTenant.mockResolvedValue(null);
    const svc = new AuthService();
    await expect(svc.issueImpersonation('admin@x.com', 'semDono')).rejects.toThrow('OWNER_NOT_FOUND');
  });
});
