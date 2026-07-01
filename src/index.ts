import { Router } from 'express';
import { notificationRouter } from './routers/notification.router.js';
import { clientRouter } from './routers/clients.router.js';
import { invoiceRouter } from './routers/invoice.router.js';
import { healthRouter } from './routers/health.router.js';

const appRouter = Router();

/**
 * Agregador de rotas da aplicação.
 * Tudo aqui é montado sob o prefixo `/api` no server.ts.
 *
 * Exemplos:
 *   POST /api/notifications/trigger-overdue
 *   POST /api/clients
 *   POST /api/invoices
 *   GET  /api/health
 */
appRouter.use('/notifications', notificationRouter);
appRouter.use('/clients', clientRouter);
appRouter.use('/invoices', invoiceRouter);
appRouter.use('/health', healthRouter);

export { appRouter };
