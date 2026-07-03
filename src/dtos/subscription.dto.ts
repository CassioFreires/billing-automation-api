import { z } from 'zod';

/**
 * Assinaturas / cobrança recorrente (spec 0009).
 * dayOfMonth limitado a 1..28 para evitar meses sem o dia 29/30/31.
 */
export const createSubscriptionSchema = z.object({
  clientId: z.string().uuid('ID do cliente inválido'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.number().positive('O valor deve ser maior que zero'),
  dayOfMonth: z.number().int().min(1).max(28).default(10),
  // Opcional: quando a 1ª cobrança deve ser gerada. Default = próxima ocorrência.
  startDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});

export const updateSubscriptionSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELED']).optional(),
});

export type CreateSubscriptionDTO = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionDTO = z.infer<typeof updateSubscriptionSchema>;

export function validateCreateSubscription(payload: unknown): CreateSubscriptionDTO {
  return createSubscriptionSchema.parse(payload);
}

export function validateUpdateSubscription(payload: unknown): UpdateSubscriptionDTO {
  return updateSubscriptionSchema.parse(payload);
}
