import { z } from 'zod';

/**
 * Regras de autonegociação por tenant (spec 0018 — M2). O dono liga o alívio e
 * define os TETOS do que o Adimplo pode oferecer sozinho. Percentuais em 0..1.
 */
export const updateNegotiationSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    hesitationOpens: z.number().int().min(1, 'Mínimo de 1 abertura').max(20).default(3),

    discountEnabled: z.boolean().default(false),
    discountPercent: z.number().min(0).max(1, 'Use 0..1 (ex.: 0.1 = 10%)').default(0),

    installmentsEnabled: z.boolean().default(false),
    maxInstallments: z.number().int().min(1).max(24).default(1),

    deferEnabled: z.boolean().default(false),
    deferMaxDays: z.number().int().min(0).max(90).default(0),
    deferFeePercent: z.number().min(0).max(1, 'Use 0..1').default(0),
  })
  .refine((d) => !d.discountEnabled || d.discountPercent > 0, {
    message: 'Defina um desconto maior que zero para habilitá-lo',
    path: ['discountPercent'],
  })
  .refine((d) => !d.installmentsEnabled || d.maxInstallments >= 2, {
    message: 'Parcelamento exige no mínimo 2 parcelas',
    path: ['maxInstallments'],
  })
  .refine((d) => !d.deferEnabled || d.deferMaxDays >= 1, {
    message: 'Adiamento exige no mínimo 1 dia',
    path: ['deferMaxDays'],
  });

export type UpdateNegotiationSettingsDTO = z.infer<typeof updateNegotiationSettingsSchema>;

export function validateUpdateNegotiationSettings(payload: unknown): UpdateNegotiationSettingsDTO {
  return updateNegotiationSettingsSchema.parse(payload);
}
