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
