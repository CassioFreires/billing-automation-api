import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { BrandController } from '../controllers/brand.controller.js';

/** White-label (spec 0050) — cor de marca do dono (JWT). */
export const brandRouter = Router();
const controller = new BrandController();

brandRouter.get('/settings', jwtAuth, controller.getSettings);
brandRouter.put('/settings', jwtAuth, controller.updateSettings);
