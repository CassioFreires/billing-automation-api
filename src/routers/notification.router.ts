import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';

const notificationRouter = Router();
const controller = new NotificationController();

notificationRouter.post('/trigger', controller.trigger.bind(controller));

export { notificationRouter };