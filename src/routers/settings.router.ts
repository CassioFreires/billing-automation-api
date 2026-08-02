import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/require-role.middleware.js';

const settingsRouter = Router();

// Configurações são por tenant → exigem JWT.
settingsRouter.use(jwtAuth);

const controller = new SettingsController();

// Alterar config da conta (credenciais de gateway/WhatsApp, régua, etc.) é ação de
// gestão: só OWNER/ADMIN (spec 0054). Leitura (GET) fica liberada a qualquer membro —
// evita que um MEMBER desvie as cobranças trocando as credenciais do recebedor.
const manage = requireRole('OWNER', 'ADMIN');

// Configuração de pagamento do tenant (spec 0012).
settingsRouter.get('/payment', controller.getPayment.bind(controller));
settingsRouter.put('/payment', manage, controller.updatePayment.bind(controller));

// Configuração de WhatsApp do tenant (spec 0014).
settingsRouter.get('/whatsapp', controller.getWhatsapp.bind(controller));
settingsRouter.put('/whatsapp', manage, controller.updateWhatsapp.bind(controller));

// Regras de autonegociação do tenant (spec 0018 — M2, Botão de Alívio).
settingsRouter.get('/negotiation', controller.getNegotiation.bind(controller));
settingsRouter.put('/negotiation', manage, controller.updateNegotiation.bind(controller));

// Régua de cobrança multi-passo do tenant (spec 0026).
settingsRouter.get('/regua', controller.getRegua.bind(controller));
settingsRouter.put('/regua', manage, controller.updateRegua.bind(controller));

// Canal de envio das cobranças do tenant (spec 0032).
settingsRouter.get('/channel', controller.getChannel.bind(controller));
settingsRouter.put('/channel', manage, controller.updateChannel.bind(controller));

export { settingsRouter };
