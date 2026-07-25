import { z } from 'zod';

/** Winback / reativação (spec 0045, F5). */
export const winbackSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  daysAfter: z.number().int().min(0).max(180).optional(),
  discountPercent: z.number().int().min(0).max(90).optional(),
  message: z.string().max(500).nullable().optional(),
});

export type WinbackSettingsDTO = z.infer<typeof winbackSettingsSchema>;

export function validateWinbackSettings(p: unknown): WinbackSettingsDTO {
  return winbackSettingsSchema.parse(p);
}
