import { describe, it, expect, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const ENV_KEYS = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'AUTH_USERNAME', 'AUTH_PASSWORD', 'DEFAULT_TENANT_ID'];
const original: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) original[k] = process.env[k];

const repo = {
  findByEmail: vi.fn(),
  createAccountWithOwner: vi.fn(),
};

/** authConfig captura env no import → recarrega o módulo (e remocka o repo) por cenário. */
async function loadService(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;

  repo.findByEmail.mockReset();
  repo.createAccountWithOwner.mockReset();

  vi.doMock('../../src/repositories/user.repository.js', () => ({
    UserRepository: class {
      findByEmail = repo.findByEmail;
      createAccountWithOwner = repo.createAccountWithOwner;
    },
  }));

  const { AuthService } = await import('../../src/services/auth.service.js');
  return new AuthService();
}

const validEnv = {
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '1h',
  AUTH_USERNAME: 'admin',
  AUTH_PASSWORD: 's3nha',
  DEFAULT_TENANT_ID: 'tenant-default',
};

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('AuthService.register', () => {
  it('cria conta+usuário, guarda a senha em hash e emite JWT', async () => {
    const svc = await loadService(validEnv);
    repo.findByEmail.mockResolvedValue(null);
    repo.createAccountWithOwner.mockResolvedValue({ id: 'u1', tenantId: 'acc1', role: 'OWNER' });

    const { token } = await svc.register({
      accountName: 'Acme',
      name: 'Ana',
      email: 'ana@acme.com',
      password: 'segredo123',
    });

    const payload = jwt.verify(token, 'test-secret') as jwt.JwtPayload;
    expect(payload.sub).toBe('u1');
    expect((payload as any).tenantId).toBe('acc1');
    expect(payload.role).toBe('OWNER');

    // senha nunca em texto puro (RN-U2)
    const arg = repo.createAccountWithOwner.mock.calls[0][0];
    expect(arg.passwordHash).not.toBe('segredo123');
    expect(await bcrypt.compare('segredo123', arg.passwordHash)).toBe(true);
  });

  it('lança EMAIL_TAKEN quando o e-mail já existe', async () => {
    const svc = await loadService(validEnv);
    repo.findByEmail.mockResolvedValue({ id: 'x' });

    await expect(
      svc.register({ accountName: 'Acme', name: 'Ana', email: 'ana@acme.com', password: 'segredo123' })
    ).rejects.toThrow('EMAIL_TAKEN');
    expect(repo.createAccountWithOwner).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  it('loga usuário real com senha correta', async () => {
    const svc = await loadService(validEnv);
    const passwordHash = bcrypt.hashSync('minhasenha', 10);
    repo.findByEmail.mockResolvedValue({ id: 'u1', tenantId: 'acc1', role: 'OWNER', passwordHash });

    const { token } = await svc.login({ username: 'ana@acme.com', password: 'minhasenha' });
    const payload = jwt.verify(token, 'test-secret') as jwt.JwtPayload;
    expect(payload.sub).toBe('u1');
    expect((payload as any).tenantId).toBe('acc1');
  });

  it('rejeita usuário real com senha errada', async () => {
    const svc = await loadService(validEnv);
    repo.findByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 'acc1',
      role: 'OWNER',
      passwordHash: bcrypt.hashSync('minhasenha', 10),
    });

    await expect(svc.login({ username: 'ana@acme.com', password: 'errada' })).rejects.toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('fallback: loga a conta de serviço via env (bootstrap)', async () => {
    const svc = await loadService(validEnv);
    repo.findByEmail.mockResolvedValue(null);

    const { token } = await svc.login({ username: 'admin', password: 's3nha' });
    const payload = jwt.verify(token, 'test-secret') as jwt.JwtPayload;
    expect(payload.role).toBe('service');
    expect((payload as any).tenantId).toBe('tenant-default');
  });

  it('rejeita quando não há usuário nem conta de serviço correspondente', async () => {
    const svc = await loadService(validEnv);
    repo.findByEmail.mockResolvedValue(null);

    await expect(svc.login({ username: 'ghost', password: 'x' })).rejects.toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('falha fechado quando JWT_SECRET ausente', async () => {
    const svc = await loadService({ AUTH_USERNAME: 'admin', AUTH_PASSWORD: 's3nha' });
    repo.findByEmail.mockResolvedValue(null);

    await expect(svc.login({ username: 'admin', password: 's3nha' })).rejects.toThrow(
      'JWT_SECRET não configurado'
    );
  });
});
