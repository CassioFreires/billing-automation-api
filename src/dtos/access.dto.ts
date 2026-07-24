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

/** Conexão IoT (spec 0043). Config da integração pelo dono. */
export const accessIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
});

export const accessWebhookSchema = z.object({
  webhookUrl: z.string().url('URL de webhook inválida').max(2048),
});

export type AccessSettingsDTO = z.infer<typeof accessSettingsSchema>;
export type AccessOverrideDTO = z.infer<typeof accessOverrideSchema>;
export type AccessIntegrationDTO = z.infer<typeof accessIntegrationSchema>;
export type AccessWebhookDTO = z.infer<typeof accessWebhookSchema>;

export function validateAccessSettings(p: unknown): AccessSettingsDTO {
  return accessSettingsSchema.parse(p);
}
export function validateAccessOverride(p: unknown): AccessOverrideDTO {
  return accessOverrideSchema.parse(p);
}
export function validateAccessIntegration(p: unknown): AccessIntegrationDTO {
  return accessIntegrationSchema.parse(p);
}
export function validateAccessWebhook(p: unknown): AccessWebhookDTO {
  return accessWebhookSchema.parse(p);
}
