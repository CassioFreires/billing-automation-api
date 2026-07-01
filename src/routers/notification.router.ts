import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';

const notificationRouter = Router();

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