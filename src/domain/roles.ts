/**
 * Papéis de usuário dentro de um tenant (spec 0030) — lógica pura.
 *
 * - OWNER : dono da conta. Poder total; sempre deve existir ao menos um.
 * - ADMIN : gerencia equipe e configurações; opera tudo.
 * - MEMBER: opera o dia a dia (clientes/faturas), mas não gerencia equipe.
 */
export const ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

/** Papéis que um convidado pode receber (OWNER não se cria por convite). */
export const ASSIGNABLE_ROLES: Role[] = ['ADMIN', 'MEMBER'];

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

/** Quem pode gerenciar a equipe (convidar, mudar papel, remover). */
export function canManageTeam(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
