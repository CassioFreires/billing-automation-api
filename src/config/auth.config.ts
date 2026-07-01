/**
 * Configuração de autenticação (fonte única de verdade).
 *
 * Lê os segredos do ambiente. Enquanto o projeto não tem modelo de usuário,
 * o login usa uma conta de serviço única (AUTH_USERNAME / AUTH_PASSWORD).
 * Quando existir tabela de usuários, basta trocar a validação em AuthService.
 */

export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  serviceUsername: process.env.AUTH_USERNAME,
  servicePassword: process.env.AUTH_PASSWORD,
  webhookSecret: process.env.WEBHOOK_SECRET,
};

/** Garante que o segredo do JWT está presente; senão falha fechado. */
export function requireJwtSecret(): string {
  if (!authConfig.jwtSecret) {
    throw new Error('JWT_SECRET não configurado');
  }
  return authConfig.jwtSecret;
}

/** Garante que o segredo do webhook está presente; senão falha fechado. */
export function requireWebhookSecret(): string {
  if (!authConfig.webhookSecret) {
    throw new Error('WEBHOOK_SECRET não configurado');
  }
  return authConfig.webhookSecret;
}
