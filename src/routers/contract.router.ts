import { Router, raw } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { ContractController } from '../controllers/contract.controller.js';

/** Contrato no Celular (spec 0040/0041, F14) — config do dono. */
export const contractRouter = Router();

const controller = new ContractController();

contractRouter.get('/settings', jwtAuth, controller.getSettings);
contractRouter.put('/settings', jwtAuth, controller.updateSettings);

// Upload do PDF (corpo binário) — parser dedicado, sem mexer no limite global (spec 0041).
contractRouter.put('/file', jwtAuth, raw({ type: 'application/pdf', limit: '6mb' }), controller.uploadFile);
contractRouter.get('/file', jwtAuth, controller.getFile);
