import { z } from 'zod';

export const updateClientSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  document: z.string().optional(),
  // Canal de e-mail (spec 0032) — opcional; envie null para limpar.
  email: z.string().trim().email('E-mail inválido').optional().nullable(),
});

export type UpdateClientDTO = z.infer<
  typeof updateClientSchema
>;

export function validateUpdateClient(
  payload: unknown
): UpdateClientDTO {
  return updateClientSchema.parse(payload);
}