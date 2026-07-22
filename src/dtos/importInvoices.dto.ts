import { z } from 'zod';

/**
 * Importação em lote de FATURAS (spec 0024). Cada linha cria uma cobrança nova
 * para o cliente identificado pelo telefone (`tenantId+phone`). O `dueDate` vem
 * como string (ISO/AAAA-MM-DD) e é convertido para Date após validar.
 */
export const importInvoiceRowSchema = z.object({
  clientPhone: z.string().min(10, 'Telefone do cliente inválido'),
  value: z.number().positive('Valor deve ser maior que zero'),
  dueDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data de vencimento inválida')
    .transform((v) => new Date(v)),
  description: z.string().min(1).optional(),
});

export const importInvoicesSchema = z.object({
  invoices: z
    .array(importInvoiceRowSchema)
    .min(1, 'Envie ao menos uma fatura')
    .max(200, 'Importe no máximo 200 faturas por vez'),
});

export type ImportInvoiceRowDTO = z.infer<typeof importInvoiceRowSchema>;
export type ImportInvoicesDTO = z.infer<typeof importInvoicesSchema>;

export function validateImportInvoices(payload: unknown): ImportInvoicesDTO {
  return importInvoicesSchema.parse(payload);
}
