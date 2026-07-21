import { z } from 'zod';

/** Troca de plano forçada pelo super-admin (spec 0023). */
export const adminChangePlanSchema = z.object({
  plan: z.enum(['free', 'essencial', 'pro']),
});

export type AdminChangePlanDTO = z.infer<typeof adminChangePlanSchema>;

export function validateAdminChangePlan(payload: unknown): AdminChangePlanDTO {
  return adminChangePlanSchema.parse(payload);
}
