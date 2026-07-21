/**
 * Configuração de autenticação (fonte única de verdade).
 *
 * Lê os segredos do ambiente. Enquanto o projeto não tem modelo de usuário,
 * o login usa uma conta de serviço única (AUTH_USERNAME / AUTH_PASSWORD).
 * Quando existir tabela de usuários, basta trocar a validação em AuthService.
 */

/** Tenant da conta de serviço (default = Account seedado na migração 0001). */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** E-mails com poder de super-admin da plataforma (spec 0023). CSV no env. */
function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  serviceUsername: process.env.AUTH_USERNAME,
  servicePassword: process.env.AUTH_PASSWORD,
  webhookSecret: process.env.WEBHOOK_SECRET,
  // Segredo de operações de SISTEMA/cron (cross-tenant) — ex.: agendador de
  // cobrança (spec 0010). Não é JWT de tenant.
  cronSecret: process.env.CRON_SECRET,
  // Enquanto não há modelo de usuário, a conta de serviço opera sobre este tenant.
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? DEFAULT_TENANT_ID,
  // Super-admin da plataforma (spec 0023): allowlist de e-mails + validade do
  // token de impersonação (curto, por segurança).
  platformAdminEmails: parseAdminEmails(process.env.PLATFORM_ADMIN_EMAILS),
  impersonationExpiresIn: process.env.IMPERSONATION_EXPIRES_IN ?? '30m',
};

/** true se o e-mail é super-admin da plataforma (case-insensitive). */
export function isPlatformAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return authConfig.platformAdminEmails.includes(email.trim().toLowerCase());
}

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

/** Garante que o segredo de sistema (cron) está presente; senão falha fechado. */
export function requireCronSecret(): string {
  if (!authConfig.cronSecret) {
    throw new Error('CRON_SECRET não configurado');
  }
  return authConfig.cronSecret;
}
