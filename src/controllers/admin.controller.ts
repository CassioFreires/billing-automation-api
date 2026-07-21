import { Request, Response } from 'express';
import { AdminService, AdminError } from '../services/admin.service.js';
import { validateAdminChangePlan } from '../dtos/admin.dto.js';

function adminEmailOf(req: Request): string {
  return (req as Request & { adminEmail?: string }).adminEmail ?? '';
}

/** Painel super-admin (spec 0023). Todas as rotas exigem requirePlatformAdmin. */
export class AdminController {
  private service: AdminService;

  constructor() {
    this.service = new AdminService();
  }

  me = async (req: Request, res: Response): Promise<void> => {
    res.json({ isPlatformAdmin: true, email: adminEmailOf(req) });
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
      await this.service.suspend(adminEmailOf(req), String(req.params.id));
      res.json({ success: true, status: 'SUSPENDED' });
    } catch (error: any) {
      res.status(400).json({ error: error?.message ?? 'Erro ao suspender' });
    }
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.activate(adminEmailOf(req), String(req.params.id));
      res.json({ success: true, status: 'ACTIVE' });
    } catch (error: any) {
      res.status(400).json({ error: error?.message ?? 'Erro ao reativar' });
    }
  };

  changePlan = async (req: Request, res: Response): Promise<void> => {
    try {
      const { plan } = validateAdminChangePlan(req.body);
      await this.service.changePlan(adminEmailOf(req), String(req.params.id), plan);
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
      const token = await this.service.impersonate(adminEmailOf(req), String(req.params.id));
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
