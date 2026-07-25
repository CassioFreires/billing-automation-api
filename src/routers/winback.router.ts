import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { WinbackController } from '../controllers/winback.controller.js';

/** Winback / reativação (spec 0045, F5) — dono (JWT). */
export const winbackRouter = Router();

const controller = new WinbackController();

winbackRouter.get('/settings', jwtAuth, controller.getSettings);
winbackRouter.put('/settings', jwtAuth, controller.updateSettings);
winbackRouter.get('/summary', jwtAuth, controller.summary);
