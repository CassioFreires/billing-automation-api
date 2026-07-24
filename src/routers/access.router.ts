import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { AccessController } from '../controllers/access.controller.js';

/** Liga/Desliga o Acesso (spec 0042, F12). */
export const accessRouter = Router();

const controller = new AccessController();

accessRouter.get('/settings', jwtAuth, controller.getSettings);
accessRouter.put('/settings', jwtAuth, controller.updateSettings);
accessRouter.get('/clients', jwtAuth, controller.listClients);
accessRouter.post('/clients/:id/override', jwtAuth, controller.setOverride);
