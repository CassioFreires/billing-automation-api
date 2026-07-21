import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../middlewares/require-admin.middleware.js';

const adminRouter = Router();

// Painel super-admin (spec 0023): exige JWT + e-mail na allowlist de admins.
adminRouter.use(jwtAuth);
adminRouter.use(requirePlatformAdmin);

const c = new AdminController();

adminRouter.get('/me', c.me);
adminRouter.get('/metrics', c.metrics);
adminRouter.get('/tenants', c.tenants);
adminRouter.get('/tenants/:id', c.tenant);
adminRouter.post('/tenants/:id/suspend', c.suspend);
adminRouter.post('/tenants/:id/activate', c.activate);
adminRouter.post('/tenants/:id/plan', c.changePlan);
adminRouter.post('/tenants/:id/impersonate', c.impersonate);

export { adminRouter };
