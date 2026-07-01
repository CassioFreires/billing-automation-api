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
