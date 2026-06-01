import { z } from 'zod';

export const createInvoiceSchema = z.object({
  clientId: z.string().uuid("ID do cliente inválido"),
  value: z.number().positive("O valor deve ser maior que zero"),
  dueDate: z.string().transform((val) => new Date(val)),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceStatusSchema = z.object({
  gatewayId: z.string(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "FAILED"]),
  paidAt: z.string().optional().transform((val) => val ? new Date(val) : undefined),
});

export type UpdateInvoiceStatusDTO = z.infer<typeof updateInvoiceStatusSchema>;