import { z } from 'zod';

/**
 * Aceite de uma opção de alívio pelo pagador (spec 0018 — M2). Rota PÚBLICA.
 * `installments` só se aplica ao tipo 'installments'.
 */
export const acceptAgreementSchema = z.object({
  type: z.enum(['discount', 'installments', 'defer']),
  installments: z.number().int().min(2).max(24).optional(),
});

export type AcceptAgreementDTO = z.infer<typeof acceptAgreementSchema>;

export function validateAcceptAgreement(payload: unknown): AcceptAgreementDTO {
  return acceptAgreementSchema.parse(payload);
}
