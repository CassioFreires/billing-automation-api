import { z } from 'zod';

/**
 * Importação em lote de clientes (spec 0008).
 * Cada linha segue o mesmo contrato do cadastro individual; a chave de
 * idempotência é o telefone (RN-T3: @@unique([tenantId, phone])).
 * O `status` é opcional — quando ausente, o default do banco (EM_DIA) prevalece.
 */
export const importClientRowSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve possuir no mínimo 3 caracteres'),

  phone: z
    .string()
    .min(10, 'Telefone inválido'),

  document: z
    .string()
    .min(11, 'Documento inválido'),

  // Canal de e-mail (spec 0032) — opcional na importação.
  email: z
    .string()
    .trim()
    .email('E-mail inválido')
    .optional()
    .nullable(),

  status: z
    .enum(['EM_DIA', 'EM_ATRASO'])
    .optional(),
});

export const importClientsSchema = z.object({
  clients: z
    .array(importClientRowSchema)
    .min(1, 'Envie ao menos um cliente')
    .max(1000, 'Importe no máximo 1000 clientes por vez'),
});

export type ImportClientRowDTO = z.infer<typeof importClientRowSchema>;
export type ImportClientsDTO = z.infer<typeof importClientsSchema>;

export function validateImportClients(
  payload: unknown
): ImportClientsDTO {
  return importClientsSchema.parse(payload);
}
