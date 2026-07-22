import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authConfig, requireJwtSecret } from '../config/auth.config.js';
import { LoginDTO } from '../dtos/login.dto.js';
import { RegisterDTO } from '../dtos/register.dto.js';
import { UserRepository } from '../repositories/user.repository.js';

const BCRYPT_ROUNDS = 10;

/** Comparação de strings resistente a timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export class AuthService {
  private readonly users: UserRepository;

  constructor() {
    this.users = new UserRepository();
  }

  private issue(
    sub: string,
    tenantId: string,
    role: string
  ): { token: string; expiresIn: string } {
    const secret = requireJwtSecret();
    const token = jwt.sign({ sub, role, tenantId }, secret, {
      expiresIn: authConfig.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
    return { token, expiresIn: authConfig.jwtExpiresIn };
  }

  /**
   * Emite um JWT de IMPERSONAÇÃO para dar suporte a um tenant (spec 0023).
   * Token CURTO, marcado com `imp` (e-mail do admin) para rastreio. Assume o
   * OWNER do tenant como identidade. Só o admin.service chama (após autorizar).
   */
  async issueImpersonation(
    adminEmail: string,
    tenantId: string
  ): Promise<{ token: string; expiresIn: string }> {
    const secret = requireJwtSecret();
    const owner = await this.users.findOwnerByTenant(tenantId);
    if (!owner) throw new Error('OWNER_NOT_FOUND');
    const token = jwt.sign(
      { sub: owner.id, role: owner.role, tenantId, scope: 'tenant', imp: adminEmail },
      secret,
      { expiresIn: authConfig.impersonationExpiresIn as jwt.SignOptions['expiresIn'] }
    );
    return { token, expiresIn: authConfig.impersonationExpiresIn };
  }

  /**
   * Cria conta (tenant) + usuário dono e retorna um JWT (RN-U3).
   * Lança EMAIL_TAKEN quando o e-mail já existe.
   */
  async register(data: RegisterDTO): Promise<{ token: string; expiresIn: string }> {
    requireJwtSecret();

    const existing = await this.users.findByEmail(data.email);
    if (existing) {
      throw new Error('EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await this.users.createAccountWithOwner({
      accountName: data.accountName,
      name: data.name,
      email: data.email,
      passwordHash,
    });

    return this.issue(user.id, user.tenantId, user.role);
  }

  /** Perfil do usuário logado (spec 0030) — para o front saber o papel. */
  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  /**
   * Login por e-mail/senha (RN-U4). Fallback: conta de serviço via env (RN-U5).
   * Lança AUTH_NOT_CONFIGURED / INVALID_CREDENTIALS conforme o caso.
   */
  async login(data: LoginDTO): Promise<{ token: string; expiresIn: string }> {
    requireJwtSecret();

    // 1) Usuário real por e-mail
    const user = await this.users.findByEmail(data.username);
    if (user) {
      const ok = await bcrypt.compare(data.password, user.passwordHash);
      if (!ok) {
        throw new Error('INVALID_CREDENTIALS');
      }
      return this.issue(user.id, user.tenantId, user.role);
    }

    // 2) Fallback: conta de serviço via env (bootstrap)
    if (authConfig.serviceUsername && authConfig.servicePassword) {
      const validUser = safeEqual(data.username, authConfig.serviceUsername);
      const validPass = safeEqual(data.password, authConfig.servicePassword);
      if (validUser && validPass) {
        return this.issue(authConfig.serviceUsername, authConfig.defaultTenantId, 'service');
      }
    }

    throw new Error('INVALID_CREDENTIALS');
  }
}
