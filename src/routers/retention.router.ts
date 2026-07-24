import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { RetentionController } from '../controllers/retention.controller.js';

/** Segura Quem Quer Sair (spec 0037, F11): fluxo de retenção no cancelamento. */
export const retentionRouter = Router();

const controller = new RetentionController();

// Config de retenção (spec 0038) — literais antes das rotas com :id.
retentionRouter.get('/settings', jwtAuth, controller.getSettings);
retentionRouter.put('/settings', jwtAuth, controller.updateSettings);

retentionRouter.post('/requests', jwtAuth, controller.open);
retentionRouter.post('/requests/:id/resolve', jwtAuth, controller.resolve);
retentionRouter.get('/requests', jwtAuth, controller.list);
