import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { RetentionController } from '../controllers/retention.controller.js';

/** Segura Quem Quer Sair (spec 0037, F11). Gate do módulo `recovery` (spec 0051). */
export const retentionRouter = Router();

const controller = new RetentionController();
const mod = requireModule('recovery');

// Config de retenção (spec 0038) — literais antes das rotas com :id.
retentionRouter.get('/settings', jwtAuth, mod, controller.getSettings);
retentionRouter.put('/settings', jwtAuth, mod, controller.updateSettings);

retentionRouter.post('/requests', jwtAuth, mod, controller.open);
retentionRouter.post('/requests/:id/resolve', jwtAuth, mod, controller.resolve);
retentionRouter.get('/requests', jwtAuth, mod, controller.list);
