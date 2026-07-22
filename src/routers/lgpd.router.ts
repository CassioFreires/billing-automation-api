import { Router } from 'express';
import { LgpdController } from '../controllers/lgpd.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const lgpdRouter = Router();

// Direitos do titular exigem JWT (usuário autenticado do tenant).
lgpdRouter.use(jwtAuth);

const controller = new LgpdController();

lgpdRouter.get('/clients/:clientId/export', controller.exportData);
lgpdRouter.post('/clients/:clientId/anonymize', controller.anonymize);

// Direitos sobre a própria conta (spec 0022): portabilidade e eliminação.
lgpdRouter.get('/account/export', controller.exportAccount);
lgpdRouter.post('/account/delete', controller.deleteAccount);

export { lgpdRouter };
