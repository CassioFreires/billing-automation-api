import { Router } from 'express';
import { SystemController } from '../controllers/system.controller.js';
import { cronAuth } from '../middlewares/cron.middleware.js';

const systemRouter = Router();

// Rotas de SISTEMA (cross-tenant): autenticadas por segredo, não por JWT de tenant.
systemRouter.use(cronAuth);

const controller = new SystemController();

// Agendador de cobrança recorrente — chamado pelo cron/EventBridge/n8n.
systemRouter.post('/billing/run', controller.runBilling.bind(controller));

// Disparo cross-tenant das notificações de vencidos (spec 0013).
systemRouter.post('/notifications/run', controller.runNotifications.bind(controller));

export { systemRouter };
