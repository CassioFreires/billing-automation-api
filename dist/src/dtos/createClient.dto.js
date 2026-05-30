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
        .min(11, 'Documento inválido')
});
export function validateCreateClient(payload) {
    return createClientSchema.parse(payload);
}
