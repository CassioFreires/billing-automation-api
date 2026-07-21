import { Request, Response } from 'express';
import { AdminService, AdminError } from '../services/admin.service.js';
import { PlatformAdminService, PlatformAdminAuthError } from '../services/platform-admin.service.js';
import { validateAdminChangePlan, validateAdminLogin } from '../dtos/admin.dto.js';

interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
}

function adminOf(req: Request): AdminIdentity {
  return (req as Request & { admin?: AdminIdentity }).admin as AdminIdentity;
}

/** Console da plataforma (spec 0031). Rotas sob requirePlatformAdmin, exceto login. */
export class AdminController {
  private service: AdminService;
  private auth: PlatformAdminService;

  constructor() {
    this.service = new AdminService();
    this.auth = new PlatformAdminService();
  }

  /** Login do console (público): e-mail/senha → token de plataforma. */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = validateAdminLogin(req.body);
      res.json(await this.auth.login(email, password));
    } catch (error: any) {
      if (error instanceof PlatformAdminAuthError) {
        res.status(401).json({ error: 'E-mail ou senha inválidos' });
        return;
      }
      res.status(400).json({ error: error?.message ?? 'Erro no login' });
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const admin = adminOf(req);
    res.json({ isPlatformAdmin: true, email: admin.email, name: admin.name, role: admin.role });
  };

  metrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.getMetrics());
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? 'Erro ao ler métricas' });
    }
  };

  tenants = async (req: Request, res: Response): Promise<void> => {
    try {
      const search = (req.query.search as string) || undefined;
      const page = parseInt(req.query.page as string) || 1;
      res.json(await this.service.listTenants({ search, page }));
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? 'Erro ao listar tenants' });
    }
  };

  tenant = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.getTenant(String(req.params.id)));
    } catch (error: any) {
      if (error instanceof AdminError && error.code === 'NOT_FOUND') {
        res.status(404).json({ error: 'Tenant não encontrado' });
        return;
      }
      res.status(500).json({ error: error?.message ?? 'Erro ao ler tenant' });
    }
  };

  suspend = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.suspend(adminOf(req).email, String(req.params.id));
      res.json({ success: true, status: 'SUSPENDED' });
    } catch (error: any) {
      res.status(400).json({ error: error?.message ?? 'Erro ao suspender' });
    }
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.activate(adminOf(req).email, String(req.params.id));
      res.json({ success: true, status: 'ACTIVE' });
    } catch (error: any) {
      res.status(400).json({ error: error?.message ?? 'Erro ao reativar' });
    }
  };

  changePlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const { plan } = validateAdminChangePlan(req.body);
      await this.service.changePlan(adminOf(req).email, String(req.params.id), plan);
      res.json({ success: true, plan });
    } catch (error: any) {
      if (error instanceof AdminError && error.code === 'INVALID_PLAN') {
        res.status(400).json({ error: 'Plano inválido' });
        return;
      }
      res.status(400).json({ error: error?.message ?? 'Erro ao mudar plano' });
    }
  };

  impersonate = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = await this.service.impersonate(adminOf(req).email, String(req.params.id));
      res.json(token);
    } catch (error: any) {
      if (error?.message === 'OWNER_NOT_FOUND') {
        res.status(404).json({ error: 'Tenant sem usuário dono para impersonar' });
        return;
      }
      res.status(400).json({ error: error?.message ?? 'Erro ao impersonar' });
    }
  };
}
