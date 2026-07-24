import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { ContractController } from '../controllers/contract.controller.js';

/** Contrato no Celular (spec 0040, F14) — config do dono. */
export const contractRouter = Router();

const controller = new ContractController();

contractRouter.get('/settings', jwtAuth, controller.getSettings);
contractRouter.put('/settings', jwtAuth, controller.updateSettings);
