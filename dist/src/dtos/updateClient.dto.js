import { z } from 'zod';
export const updateClientSchema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    document: z.string().optional()
});
export function validateUpdateClient(payload) {
    return updateClientSchema.parse(payload);
}
