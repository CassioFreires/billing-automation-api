import { z } from 'zod';

/**
 * Configuração de pagamento por tenant (spec 0012).
 * v1: provider + handle público do InfinitePay + redirect opcional.
 * Credenciais secretas (ex.: token MP) ficam para depois (com criptografia).
 */
export const updatePaymentSettingsSchema = z
  .object({
    provider: z.enum(['infinitepay', 'mercadopago', 'mock']),
    infinitepayHandle: z.string().trim().min(1).optional().nullable(),
    redirectUrl: z.string().url('URL de retorno inválida').optional().nullable(),
  })
  .refine(
    (d) => d.provider !== 'infinitepay' || (d.infinitepayHandle && d.infinitepayHandle.length > 0),
    { message: 'Informe o handle do InfinitePay', path: ['infinitepayHandle'] }
  );

export type UpdatePaymentSettingsDTO = z.infer<typeof updatePaymentSettingsSchema>;

export function validateUpdatePaymentSettings(payload: unknown): UpdatePaymentSettingsDTO {
  return updatePaymentSettingsSchema.parse(payload);
}
