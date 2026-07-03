import { z } from 'zod';

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Descrição do item é obrigatória"),
  quantity: z.number().int().positive("Quantidade deve ser > 0").default(1),
  unitPrice: z.number().positive("Valor unitário deve ser > 0"),
});

export const createInvoiceSchema = z
  .object({
    clientId: z.string().uuid("ID do cliente inválido"),
    // value é opcional: quando há itens, o total é a soma deles.
    value: z.number().positive("O valor deve ser maior que zero").optional(),
    dueDate: z.string().transform((val) => new Date(val)),
    items: z.array(invoiceItemSchema).optional(),
  })
  .refine(
    (d) => (d.items && d.items.length > 0) || (typeof d.value === "number" && d.value > 0),
    { message: "Informe um valor ou ao menos um item" }
  );

export type InvoiceItemDTO = z.infer<typeof invoiceItemSchema>;
export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceStatusSchema = z.object({
  gatewayId: z.string(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "FAILED"]),
  paidAt: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  eventId: z.string().optional(), // idempotência do webhook (RN-P3)
});

export type UpdateInvoiceStatusDTO = z.infer<typeof updateInvoiceStatusSchema>;