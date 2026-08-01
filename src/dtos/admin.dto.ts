import { z } from 'zod';

/** Login do console de plataforma (spec 0031). */
export const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type AdminLoginDTO = z.infer<typeof adminLoginSchema>;
export function validateAdminLogin(payload: unknown): AdminLoginDTO {
  return adminLoginSchema.parse(payload);
}

/** Troca de plano forçada pelo super-admin (spec 0023). */
export const adminChangePlanSchema = z.object({
  plan: z.enum(['free', 'essencial', 'pro']),
});

export type AdminChangePlanDTO = z.infer<typeof adminChangePlanSchema>;

export function validateAdminChangePlan(payload: unknown): AdminChangePlanDTO {
  return adminChangePlanSchema.parse(payload);
}

/** Concessão/revogação de módulo pelo super-admin (spec 0051). */
export const adminSetModuleSchema = z.object({
  moduleKey: z.enum(['fiscal', 'access', 'growth', 'recovery']),
  granted: z.boolean(),
});

export type AdminSetModuleDTO = z.infer<typeof adminSetModuleSchema>;

export function validateAdminSetModule(payload: unknown): AdminSetModuleDTO {
  return adminSetModuleSchema.parse(payload);
}
