import { z } from 'zod';

/** Escolha de plano no checkout da assinatura do SaaS (spec 0020). */
export const checkoutSchema = z.object({
  plan: z.enum(['free', 'essencial', 'pro']),
});

export type CheckoutDTO = z.infer<typeof checkoutSchema>;

export function validateCheckout(payload: unknown): CheckoutDTO {
  return checkoutSchema.parse(payload);
}
