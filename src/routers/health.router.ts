// src/routers/health.router.ts

import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const healthRouter = Router();
const controller = new HealthController();

healthRouter.get('/', controller.check.bind(controller));

export { healthRouter };