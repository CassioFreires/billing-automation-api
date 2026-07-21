import { z } from 'zod';

/**
 * Ações de UI do onboarding guiado (spec 0021). Ambos os campos são opcionais,
 * mas ao menos um deve vir — não faz sentido um PATCH vazio.
 */
export const updateOnboardingSchema = z
  .object({
    dismiss: z.boolean().optional(),
    skipWhatsapp: z.boolean().optional(),
  })
  .refine((d) => d.dismiss !== undefined || d.skipWhatsapp !== undefined, {
    message: 'Informe "dismiss" e/ou "skipWhatsapp"',
  });

export type UpdateOnboardingDTO = z.infer<typeof updateOnboardingSchema>;

export function validateUpdateOnboarding(payload: unknown): UpdateOnboardingDTO {
  return updateOnboardingSchema.parse(payload);
}
