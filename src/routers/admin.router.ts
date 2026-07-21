import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authLimiter } from '../middlewares/rate-limit.middleware.js';
import { requirePlatformAdmin } from '../middlewares/require-admin.middleware.js';

const adminRouter = Router();
const c = new AdminController();

// Login do console (spec 0031): PÚBLICO (identidade própria PlatformAdmin, token
// de escopo 'platform'). Limite estrito de tentativas.
adminRouter.post('/auth/login', authLimiter, c.login);

// Demais rotas do console exigem token de PLATAFORMA (scope platform).
adminRouter.use(requirePlatformAdmin);

adminRouter.get('/me', c.me);
adminRouter.get('/metrics', c.metrics);
adminRouter.get('/tenants', c.tenants);
adminRouter.get('/tenants/:id', c.tenant);
adminRouter.post('/tenants/:id/suspend', c.suspend);
adminRouter.post('/tenants/:id/activate', c.activate);
adminRouter.post('/tenants/:id/plan', c.changePlan);
adminRouter.post('/tenants/:id/impersonate', c.impersonate);

export { adminRouter };
