import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { WinbackController } from '../controllers/winback.controller.js';

/** Winback / reativação (spec 0045, F5) — dono (JWT). Gate do módulo `growth` (spec 0051). */
export const winbackRouter = Router();

const controller = new WinbackController();
const mod = requireModule('growth');

winbackRouter.get('/settings', jwtAuth, mod, controller.getSettings);
winbackRouter.put('/settings', jwtAuth, mod, controller.updateSettings);
winbackRouter.get('/summary', jwtAuth, mod, controller.summary);
