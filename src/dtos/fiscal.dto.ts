import { z } from 'zod';

/** NFS-e / Nota Fiscal (spec 0047, F7). */
export const fiscalSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(['mock', 'nfeio']).optional(),
  apiKey: z.string().max(500).nullable().optional(),
  webhookSecret: z.string().max(500).nullable().optional(),
  companyId: z.string().max(200).nullable().optional(),
  cityServiceCode: z.string().max(50).nullable().optional(),
  autoEmitOnPaid: z.boolean().optional(),
});

export type FiscalSettingsDTO = z.infer<typeof fiscalSettingsSchema>;

export function validateFiscalSettings(p: unknown): FiscalSettingsDTO {
  return fiscalSettingsSchema.parse(p);
}
