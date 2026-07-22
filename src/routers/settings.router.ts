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

// Configuração de WhatsApp do tenant (spec 0014).
settingsRouter.get('/whatsapp', controller.getWhatsapp.bind(controller));
settingsRouter.put('/whatsapp', controller.updateWhatsapp.bind(controller));

// Regras de autonegociação do tenant (spec 0018 — M2, Botão de Alívio).
settingsRouter.get('/negotiation', controller.getNegotiation.bind(controller));
settingsRouter.put('/negotiation', controller.updateNegotiation.bind(controller));

// Régua de cobrança multi-passo do tenant (spec 0026).
settingsRouter.get('/regua', controller.getRegua.bind(controller));
settingsRouter.put('/regua', controller.updateRegua.bind(controller));

// Canal de envio das cobranças do tenant (spec 0032).
settingsRouter.get('/channel', controller.getChannel.bind(controller));
settingsRouter.put('/channel', controller.updateChannel.bind(controller));

export { settingsRouter };
