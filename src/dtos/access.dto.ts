import { z } from 'zod';

/** Liga/Desliga o Acesso (spec 0042). */

export const accessSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  graceDays: z.number().int().min(0).max(90).optional(),
  requireSignedContract: z.boolean().optional(),
});

export const accessOverrideSchema = z.object({
  override: z.enum(['allow', 'block', 'none']),
});

export type AccessSettingsDTO = z.infer<typeof accessSettingsSchema>;
export type AccessOverrideDTO = z.infer<typeof accessOverrideSchema>;

export function validateAccessSettings(p: unknown): AccessSettingsDTO {
  return accessSettingsSchema.parse(p);
}
export function validateAccessOverride(p: unknown): AccessOverrideDTO {
  return accessOverrideSchema.parse(p);
}
