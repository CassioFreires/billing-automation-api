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

// Varredura da cobrança do SaaS (spec 0020): expira trials/períodos vencidos.
systemRouter.post('/platform-billing/run', controller.runPlatformBilling.bind(controller));

// Sweep de recuperação de pagamento falho (spec 0033, F1): abre/avança casos.
systemRouter.post('/recovery/run', controller.runRecovery.bind(controller));

// Radar de Risco (spec 0035, F2): recalcula a saúde de todos os clientes.
systemRouter.post('/health/run', controller.runHealth.bind(controller));

export { systemRouter };
