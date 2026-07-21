import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireWriteAccess } from '../middlewares/require-plan.middleware.js';

const subscriptionRouter = Router();

// Todas as rotas exigem JWT válido (o n8n loga com credenciais de serviço).
subscriptionRouter.use(jwtAuth);
// Gating do plano (spec 0020): escrita exige plano ativo; conta de serviço passa.
subscriptionRouter.use(requireWriteAccess);

const controller = new SubscriptionController();

// Geração recorrente — literal antes de :id.
subscriptionRouter.post('/run', controller.run.bind(controller));

subscriptionRouter.post('/', controller.create.bind(controller));
subscriptionRouter.get('/', controller.findAll.bind(controller));
subscriptionRouter.get('/:id', controller.findById.bind(controller));
subscriptionRouter.put('/:id', controller.update.bind(controller));
subscriptionRouter.delete('/:id', controller.delete.bind(controller));

export { subscriptionRouter };
