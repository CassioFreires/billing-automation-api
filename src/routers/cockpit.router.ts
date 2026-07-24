import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { CockpitController } from '../controllers/cockpit.controller.js';

/** Cockpit do dono (M4, spec 0017): inteligência de recebíveis, somente leitura. */
export const cockpitRouter = Router();

const controller = new CockpitController();

cockpitRouter.get('/overview', jwtAuth, controller.overview);

// Lista do Dia (spec 0036, F3): fila de ação priorizada por dinheiro em risco.
cockpitRouter.get('/actions', jwtAuth, controller.actions);
