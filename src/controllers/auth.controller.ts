import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { loginSchema } from '../dtos/login.dto.js';
import { registerSchema } from '../dtos/register.dto.js';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = registerSchema.parse(req.body);
      const result = await this.authService.register(data);
      res.status(201).json(result);
    } catch (error: any) {
      if (error?.message === 'EMAIL_TAKEN') {
        res.status(409).json({ error: 'E-mail já cadastrado' });
        return;
      }
      if (error?.message === 'JWT_SECRET não configurado') {
        console.error('❌ Auth mal configurada:', error.message);
        res.status(500).json({ error: 'Autenticação não configurada' });
        return;
      }
      res.status(400).json({ error: error.message || 'Erro no cadastro' });
    }
  };

  /** Perfil do usuário autenticado (spec 0030). Requer jwtAuth. */
  me = async (req: Request, res: Response): Promise<void> => {
    try {
      const auth = (req as Request & { auth?: { sub?: string } }).auth;
      const profile = await this.authService.getProfile(String(auth?.sub ?? ''));
      res.status(200).json(profile);
    } catch {
      res.status(404).json({ error: 'Usuário não encontrado' });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data);
      res.status(200).json(result);
    } catch (error: any) {
      if (error?.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }
      if (error?.message === 'AUTH_NOT_CONFIGURED' || error?.message === 'JWT_SECRET não configurado') {
        console.error('❌ Auth mal configurada:', error.message);
        res.status(500).json({ error: 'Autenticação não configurada' });
        return;
      }
      // Erro de validação (Zod) ou outro
      res.status(400).json({ error: error.message || 'Erro no login' });
    }
  };
}
