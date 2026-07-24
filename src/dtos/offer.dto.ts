import { z } from 'zod';

/** Loja no Pagamento (spec 0044, F15). */

const typeEnum = z.enum(['addon', 'upgrade', 'produto']);

export const offerCreateSchema = z.object({
  name: z.string().min(2).max(120),
  priceCents: z.number().int().positive(),
  type: typeEnum.optional(),
  active: z.boolean().optional(),
});

export const offerUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  priceCents: z.number().int().positive().optional(),
  type: typeEnum.optional(),
  active: z.boolean().optional(),
});

export const offerAcceptSchema = z.object({
  offerId: z.string().min(1),
});

export type OfferCreateDTO = z.infer<typeof offerCreateSchema>;
export type OfferUpdateDTO = z.infer<typeof offerUpdateSchema>;
export type OfferAcceptDTO = z.infer<typeof offerAcceptSchema>;

export function validateOfferCreate(p: unknown): OfferCreateDTO {
  return offerCreateSchema.parse(p);
}
export function validateOfferUpdate(p: unknown): OfferUpdateDTO {
  return offerUpdateSchema.parse(p);
}
export function validateOfferAccept(p: unknown): OfferAcceptDTO {
  return offerAcceptSchema.parse(p);
}
