import { Router } from 'express';
import { notificationRouter } from './src/routers/notification.router.js';
import { clientRouter } from './src/routers/clients.router.js';
import { invoiceRouter } from './src/routers/invoice.router.js';

const appRouter = Router();

/**
 * Vincula as rotas de notificações.
 * Qualquer rota dentro de notificationRouter agora começará com /notifications
 * Exemplo: POST /notifications/trigger
 */
appRouter.use('/notifications', notificationRouter);
appRouter.use('/clients', clientRouter);
appRouter.use('/invoices', invoiceRouter);

// Se no futuro você criar novas rotas, basta plugar aqui:
// appRouter.use('/clients', clientsRouter);

export { appRouter };