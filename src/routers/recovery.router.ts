import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { RecoveryController } from '../controllers/recovery.controller.js';

/** Casos de recuperação do dono (spec 0033, F1) — leitura + encerramento manual. */
export const recoveryRouter = Router();

const controller = new RecoveryController();

recoveryRouter.get('/cases', jwtAuth, controller.listCases);
recoveryRouter.get('/cases/:id', jwtAuth, controller.getCase);
recoveryRouter.post('/cases/:id/close', jwtAuth, controller.closeCase);
