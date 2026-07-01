import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { authConfig, requireJwtSecret } from '../config/auth.config.js';
import { LoginDTO } from '../dtos/login.dto.js';

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
  /**
   * Valida as credenciais da conta de serviço e retorna um JWT assinado.
   * Lança AUTH_NOT_CONFIGURED / INVALID_CREDENTIALS conforme o caso.
   */
  login(data: LoginDTO): { token: string; expiresIn: string } {
    const secret = requireJwtSecret();

    if (!authConfig.serviceUsername || !authConfig.servicePassword) {
      throw new Error('AUTH_NOT_CONFIGURED');
    }

    const validUser = safeEqual(data.username, authConfig.serviceUsername);
    const validPass = safeEqual(data.password, authConfig.servicePassword);

    if (!validUser || !validPass) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const token = jwt.sign(
      {
        sub: authConfig.serviceUsername,
        role: 'service',
        tenantId: authConfig.defaultTenantId,
      },
      secret,
      { expiresIn: authConfig.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    return { token, expiresIn: authConfig.jwtExpiresIn };
  }
}
