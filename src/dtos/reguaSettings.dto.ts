import { z } from 'zod';

/**
 * Régua de cobrança por tenant (spec 0026). Passos ordenados por offset crescente
 * (offset relativo ao vencimento). Mensagem opcional com variáveis {nome}/{valor}.
 */
export const reguaStepSchema = z.object({
  offsetDays: z.number().int().min(-30, 'Antecedência máxima de 30 dias').max(90, 'Até 90 dias após'),
  message: z.string().max(500, 'Mensagem muito longa').optional(),
});

export const updateReguaSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    steps: z.array(reguaStepSchema).max(6, 'No máximo 6 passos').default([]),
  })
  .refine((d) => !d.enabled || d.steps.length >= 1, {
    message: 'Ligue a régua com ao menos um passo',
    path: ['steps'],
  })
  .refine(
    (d) => {
      // offsets estritamente crescentes (RN-2602)
      for (let i = 1; i < d.steps.length; i++) {
        if (d.steps[i].offsetDays <= d.steps[i - 1].offsetDays) return false;
      }
      return true;
    },
    { message: 'Os passos devem ter dias em ordem crescente e sem repetir', path: ['steps'] }
  );

export type UpdateReguaSettingsDTO = z.infer<typeof updateReguaSettingsSchema>;

export function validateUpdateReguaSettings(payload: unknown): UpdateReguaSettingsDTO {
  return updateReguaSettingsSchema.parse(payload);
}
