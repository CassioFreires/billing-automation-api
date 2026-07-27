import { z } from 'zod';

/** Indique e Ganhe (spec 0046, F16). */
export const referralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  rewardCents: z.number().int().min(0).max(100_000_00).optional(),
  rewardWho: z.enum(['both', 'referred', 'referrer']).optional(),
});

export const referralCaptureSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(10).max(20),
});

export type ReferralSettingsDTO = z.infer<typeof referralSettingsSchema>;
export type ReferralCaptureDTO = z.infer<typeof referralCaptureSchema>;

export function validateReferralSettings(p: unknown): ReferralSettingsDTO {
  return referralSettingsSchema.parse(p);
}
export function validateReferralCapture(p: unknown): ReferralCaptureDTO {
  return referralCaptureSchema.parse(p);
}
