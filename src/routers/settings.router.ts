import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const settingsRouter = Router();

// Configurações são por tenant → exigem JWT.
settingsRouter.use(jwtAuth);

const controller = new SettingsController();

// Configuração de pagamento do tenant (spec 0012).
settingsRouter.get('/payment', controller.getPayment.bind(controller));
settingsRouter.put('/payment', controller.updatePayment.bind(controller));

export { settingsRouter };
