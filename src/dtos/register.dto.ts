import { z } from 'zod';

export const registerSchema = z.object({
  accountName: z.string().min(2, 'Nome da conta é obrigatório'),
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  // LGPD (spec 0022): aceite obrigatório dos Termos e da Política de Privacidade.
  acceptedTerms: z
    .boolean()
    .refine((v) => v === true, 'É preciso aceitar os Termos e a Política de Privacidade'),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
