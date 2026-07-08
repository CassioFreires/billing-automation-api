import { z } from 'zod';

/** Meios de pagamento aceitos na baixa manual (spec 0015). */
export const PAYMENT_METHODS = [
  'pix',
  'dinheiro',
  'transferencia',
  'cartao',
  'boleto',
  'outro',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Corpo de POST /api/invoices/:id/payments (baixa manual). */
export const registerManualPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive().optional(), // default = valor da fatura (RN-REC5)
  paidAt: z.coerce.date().optional(),       // default = agora
  note: z.string().max(500).optional(),
  receiptUrl: z.string().url().optional(),
});

export type RegisterManualPaymentDTO = z.infer<typeof registerManualPaymentSchema>;
