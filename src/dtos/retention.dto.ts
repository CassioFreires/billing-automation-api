import { z } from 'zod';

/** Retenção no cancelamento (spec 0037, F11). */

export const openCancellationSchema = z.object({
  subscriptionId: z.string().uuid('ID da assinatura inválido'),
  reason: z.enum(['preco', 'nao_uso', 'mudanca', 'insatisfacao', 'outro']).optional(),
});

export const resolveCancellationSchema = z.object({
  outcome: z.enum(['saved', 'cancelled']),
  offer: z.enum(['pause', 'discount', 'downgrade', 'winback_later']).optional(),
});

export type OpenCancellationDTO = z.infer<typeof openCancellationSchema>;
export type ResolveCancellationDTO = z.infer<typeof resolveCancellationSchema>;

export function validateOpenCancellation(payload: unknown): OpenCancellationDTO {
  return openCancellationSchema.parse(payload);
}
export function validateResolveCancellation(payload: unknown): ResolveCancellationDTO {
  return resolveCancellationSchema.parse(payload);
}
