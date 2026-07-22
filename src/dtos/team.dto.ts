import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '../domain/roles.js';

/** Convite/criação de membro (spec 0030). Só papéis atribuíveis (ADMIN/MEMBER). */
export const inviteMemberSchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
});

export const changeRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
});

export type InviteMemberDTO = z.infer<typeof inviteMemberSchema>;
export type ChangeRoleDTO = z.infer<typeof changeRoleSchema>;

export function validateInviteMember(payload: unknown): InviteMemberDTO {
  return inviteMemberSchema.parse(payload);
}
export function validateChangeRole(payload: unknown): ChangeRoleDTO {
  return changeRoleSchema.parse(payload);
}
