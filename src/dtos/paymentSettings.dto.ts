import { z } from 'zod';
import { PAYMENT_PROVIDERS } from '../apis/payment/index.js';

/**
 * Configuração de pagamento por tenant (spec 0012 + 0019 multi-gateway).
 * O dono escolhe o gateway que já usa e informa as credenciais dele.
 *
 * Segredos (apiKey/token/secretKey/...) vêm em `credentials` e são WRITE-ONLY:
 * a API nunca os devolve (só `credentialStatus`). Campo em branco/ausente =
 * "mantém o que já está salvo" (mesmo padrão do token do WhatsApp) — por isso o
 * DTO não os torna obrigatórios; o front exige no primeiro cadastro.
 */
const secret = z.string().trim().min(1).optional();

const credentialsSchema = z
  .object({
    apiKey: secret, // asaas
    token: secret, // pagbank
    clientId: secret, // efi
    clientSecret: secret, // efi
    certificateBase64: secret, // efi (PIX/mTLS)
    secretKey: secret, // stripe | pagarme
    webhookSecret: secret, // stripe | pagarme | mercadopago
    webhookToken: secret, // asaas | efi
    accessToken: secret, // mercadopago
  })
  .partial();

export const updatePaymentSettingsSchema = z
  .object({
    provider: z.enum(PAYMENT_PROVIDERS),
    infinitepayHandle: z.string().trim().min(1).optional().nullable(),
    redirectUrl: z.string().url('URL de retorno inválida').optional().nullable(),
    credentials: credentialsSchema.optional(),
  })
  .refine(
    (d) => d.provider !== 'infinitepay' || (d.infinitepayHandle && d.infinitepayHandle.length > 0),
    { message: 'Informe o handle do InfinitePay', path: ['infinitepayHandle'] }
  );

export type UpdatePaymentSettingsDTO = z.infer<typeof updatePaymentSettingsSchema>;
export type PaymentCredentials = z.infer<typeof credentialsSchema>;

export function validateUpdatePaymentSettings(payload: unknown): UpdatePaymentSettingsDTO {
  return updatePaymentSettingsSchema.parse(payload);
}
