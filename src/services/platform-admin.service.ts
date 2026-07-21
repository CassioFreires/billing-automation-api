import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authConfig, requireJwtSecret } from '../config/auth.config.js';
import { PlatformAdminRepository } from '../repositories/platform-admin.repository.js';

/** Credenciais inválidas no login do console (controller → 401). */
export class PlatformAdminAuthError extends Error {
  constructor() {
    super('INVALID_CREDENTIALS');
  }
}

export class PlatformAdminService {
  private repo: PlatformAdminRepository;

  constructor(deps?: { repo?: PlatformAdminRepository }) {
    this.repo = deps?.repo ?? new PlatformAdminRepository();
  }

  /**
   * Login do console (spec 0031). Emite JWT de PLATAFORMA: `scope:'platform'`,
   * SEM tenantId — token que só o `requirePlatformAdmin` aceita e que nunca
   * passa no `jwtAuth` de tenant (que exige tenantId).
   */
  async login(email: string, password: string) {
    const admin = await this.repo.findByEmail(email);
    if (!admin) throw new PlatformAdminAuthError();
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new PlatformAdminAuthError();

    const token = jwt.sign(
      { sub: admin.id, scope: 'platform', role: admin.role },
      requireJwtSecret(),
      { expiresIn: authConfig.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    return {
      token,
      expiresIn: authConfig.jwtExpiresIn,
      admin: { email: admin.email, name: admin.name, role: admin.role },
    };
  }

  getById(id: string) {
    return this.repo.findById(id);
  }
}
