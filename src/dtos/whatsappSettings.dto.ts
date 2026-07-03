import { z } from 'zod';

/**
 * Configuração de WhatsApp por tenant (spec 0014).
 * provider 'cloud' exige phoneNumberId e token (credenciais da Meta do tenant).
 * O token é sensível — a API o aceita na escrita, mas nunca o devolve na leitura.
 */
export const updateWhatsappSettingsSchema = z
  .object({
    provider: z.enum(['log', 'cloud']),
    phoneNumberId: z.string().trim().min(1).optional().nullable(),
    // token opcional no update: se ausente, mantém o já salvo (não sobrescreve com vazio).
    token: z.string().trim().min(1).optional().nullable(),
    apiVersion: z.string().trim().optional().nullable(),
  })
  .refine(
    (d) => d.provider !== 'cloud' || (d.phoneNumberId && d.phoneNumberId.length > 0),
    { message: 'Informe o Phone Number ID da Meta', path: ['phoneNumberId'] }
  );

export type UpdateWhatsappSettingsDTO = z.infer<typeof updateWhatsappSettingsSchema>;

export function validateUpdateWhatsappSettings(payload: unknown): UpdateWhatsappSettingsDTO {
  return updateWhatsappSettingsSchema.parse(payload);
}
