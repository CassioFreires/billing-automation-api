import { z } from 'zod';

export const registerSchema = z.object({
  accountName: z.string().min(2, 'Nome da conta é obrigatório'),
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
