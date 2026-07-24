import { z } from 'zod';

/** Contrato no Celular (spec 0040). */

export const contractSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().min(1, 'Título obrigatório').max(200).optional(),
  body: z.string().max(20000).optional(),
  mode: z.enum(['text', 'file']).optional(),
});

export const acceptContractSchema = z.object({
  name: z.string().min(3, 'Informe seu nome completo').max(200),
  document: z.string().max(40).optional(),
});

export type ContractSettingsDTO = z.infer<typeof contractSettingsSchema>;
export type AcceptContractDTO = z.infer<typeof acceptContractSchema>;

export function validateContractSettings(p: unknown): ContractSettingsDTO {
  return contractSettingsSchema.parse(p);
}
export function validateAcceptContract(p: unknown): AcceptContractDTO {
  return acceptContractSchema.parse(p);
}
