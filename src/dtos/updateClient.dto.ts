import { z } from 'zod';

export const updateClientSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  document: z.string().optional()
});

export type UpdateClientDTO = z.infer<
  typeof updateClientSchema
>;

export function validateUpdateClient(
  payload: unknown
): UpdateClientDTO {
  return updateClientSchema.parse(payload);
}