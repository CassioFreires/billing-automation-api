import { z } from 'zod';

export const createClientSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve possuir no mínimo 3 caracteres'),

  phone: z
    .string()
    .min(10, 'Telefone inválido'),

  document: z
    .string()
    .min(11, 'Documento inválido'),

  // Canal de e-mail (spec 0032) — opcional.
  email: z
    .string()
    .trim()
    .email('E-mail inválido')
    .optional()
    .nullable(),
});

export type CreateClientDTO = z.infer<
  typeof createClientSchema
>;

export function validateCreateClient(
  payload: unknown
): CreateClientDTO {
  return createClientSchema.parse(payload);
}