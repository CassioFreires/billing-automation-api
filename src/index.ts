import { Router } from 'express';
import { authRouter } from './routers/auth.router.js';
import { notificationRouter } from './routers/notification.router.js';
import { clientRouter } from './routers/clients.router.js';
import { invoiceRouter } from './routers/invoice.router.js';
import { subscriptionRouter } from './routers/subscription.router.js';
import { systemRouter } from './routers/system.router.js';
import { healthRouter } from './routers/health.router.js';
import { lgpdRouter } from './routers/lgpd.router.js';

const appRouter = Router();

/**
 * Agregador de rotas da aplicação.
 * Tudo aqui é montado sob o prefixo `/api` no server.ts.
 *
 * Acesso:
 *   /auth      → público (emite JWT)
 *   /health    → público
 *   /clients, /notifications, /invoices, /subscriptions (exceto webhook) → exigem JWT
 *   /invoices/webhook → exige segredo do webhook (x-webhook-secret)
 *   /system → exige segredo de sistema (x-cron-secret) — operações cross-tenant
 */
appRouter.use('/auth', authRouter);
appRouter.use('/notifications', notificationRouter);
appRouter.use('/clients', clientRouter);
appRouter.use('/invoices', invoiceRouter);
appRouter.use('/subscriptions', subscriptionRouter);
appRouter.use('/system', systemRouter);
appRouter.use('/lgpd', lgpdRouter);
appRouter.use('/health', healthRouter);

export { appRouter };
