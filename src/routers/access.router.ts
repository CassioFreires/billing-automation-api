import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { accessApiKeyAuth } from '../middlewares/access-api-key.middleware.js';
import { AccessController } from '../controllers/access.controller.js';
import { AccessIntegrationController } from '../controllers/access-integration.controller.js';

/** Liga/Desliga o Acesso (spec 0042, F12) + Conexão IoT/Catracas (spec 0043, F13). */
export const accessRouter = Router();

const controller = new AccessController();
const integration = new AccessIntegrationController();

// F12 — Liga/Desliga (dono, JWT).
accessRouter.get('/settings', jwtAuth, controller.getSettings);
accessRouter.put('/settings', jwtAuth, controller.updateSettings);
accessRouter.get('/clients', jwtAuth, controller.listClients);
accessRouter.post('/clients/:id/override', jwtAuth, controller.setOverride);

// F13 — Conexão IoT: config da integração pelo dono (JWT).
accessRouter.get('/integration', jwtAuth, integration.getIntegration);
accessRouter.put('/integration', jwtAuth, integration.setEnabled);
accessRouter.post('/integration/api-key/rotate', jwtAuth, integration.rotateApiKey);
accessRouter.post('/integration/api-key/revoke', jwtAuth, integration.revokeApiKey);
accessRouter.put('/integration/webhook', jwtAuth, integration.setWebhook);
accessRouter.delete('/integration/webhook', jwtAuth, integration.clearWebhook);
accessRouter.post('/integration/webhook/test', jwtAuth, integration.testWebhook);
accessRouter.get('/events', jwtAuth, integration.listEvents);

// F13 — PULL: a catraca pergunta se libera. Autentica por API key (x-api-key),
// não por JWT. Precede nenhuma outra rota com o mesmo path (é GET /check).
accessRouter.get('/check', accessApiKeyAuth, integration.check);
