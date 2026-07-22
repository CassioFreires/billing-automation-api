import { Router } from 'express';

import { ClientController } from '../controllers/clients.controller.js';
import { PortalController } from '../controllers/portal.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireWriteAccess } from '../middlewares/require-plan.middleware.js';

const clientRouter = Router();

// Todas as rotas de clientes exigem JWT válido.
clientRouter.use(jwtAuth);
// Gating do plano (spec 0020): leitura livre, escrita exige plano ativo.
clientRouter.use(requireWriteAccess);

const controller =
  new ClientController();
const portalController = new PortalController();

clientRouter.post(
  '/',
  controller.create.bind(controller)
);

// Link do Portal do pagador de um cliente (spec 0027) — gera/recupera o token.
clientRouter.get('/:id/portal-link', portalController.getPortalLink);

// Importação em lote (upsert idempotente por telefone) — literal antes de :id
clientRouter.post(
  '/import',
  controller.import.bind(controller)
);

clientRouter.get(
  '/',
  controller.findAll.bind(controller)
);

clientRouter.get(
  '/:id',
  controller.findById.bind(controller)
);

clientRouter.put(
  '/:id',
  controller.update.bind(controller)
);

clientRouter.delete(
  '/:id',
  controller.delete.bind(controller)
);

export { clientRouter };