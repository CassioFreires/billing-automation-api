import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const notificationRouter = Router();

// Disparo de cobranças exige JWT válido.
notificationRouter.use(jwtAuth);

const controller = new NotificationController();

notificationRouter.post(
  '/trigger-overdue',
  controller.triggerOverdueNotifications.bind(controller)
);


notificationRouter.post(
  '/trigger-overdue/:invoiceId',
  controller.triggerByInvoice.bind(controller)
);

export { notificationRouter };