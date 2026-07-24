import { z } from 'zod';

/** Retenção no cancelamento (spec 0037, F11). */

export const openCancellationSchema = z.object({
  subscriptionId: z.string().uuid('ID da assinatura inválido'),
  reason: z.enum(['preco', 'nao_uso', 'mudanca', 'insatisfacao', 'outro']).optional(),
});

export const resolveCancellationSchema = z.object({
  outcome: z.enum(['saved', 'cancelled']),
  offer: z.enum(['pause', 'discount', 'downgrade', 'winback_later']).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountMonths: z.number().int().min(1).max(12).optional(),
});

/** Config de retenção (spec 0038). Todos opcionais (patch parcial). */
export const retentionSettingsSchema = z.object({
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountDurationMonths: z.number().int().min(1).max(12).optional(),
  discountEnabled: z.boolean().optional(),
  pauseEnabled: z.boolean().optional(),
});

export type OpenCancellationDTO = z.infer<typeof openCancellationSchema>;
export type ResolveCancellationDTO = z.infer<typeof resolveCancellationSchema>;
export type RetentionSettingsDTO = z.infer<typeof retentionSettingsSchema>;

export function validateOpenCancellation(payload: unknown): OpenCancellationDTO {
  return openCancellationSchema.parse(payload);
}
export function validateResolveCancellation(payload: unknown): ResolveCancellationDTO {
  return resolveCancellationSchema.parse(payload);
}
export function validateRetentionSettings(payload: unknown): RetentionSettingsDTO {
  return retentionSettingsSchema.parse(payload);
}
