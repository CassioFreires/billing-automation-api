import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { accessApiKeyAuth } from '../middlewares/access-api-key.middleware.js';
import { AccessController } from '../controllers/access.controller.js';
import { AccessIntegrationController } from '../controllers/access-integration.controller.js';

/** Liga/Desliga o Acesso (spec 0042, F12) + Conexão IoT/Catracas (spec 0043, F13).
 *  Gate do módulo `access` (spec 0051) nas rotas do dono (JWT). */
export const accessRouter = Router();

const controller = new AccessController();
const integration = new AccessIntegrationController();
const mod = requireModule('access');

// F12 — Liga/Desliga (dono, JWT).
accessRouter.get('/settings', jwtAuth, mod, controller.getSettings);
accessRouter.put('/settings', jwtAuth, mod, controller.updateSettings);
accessRouter.get('/clients', jwtAuth, mod, controller.listClients);
accessRouter.post('/clients/:id/override', jwtAuth, mod, controller.setOverride);

// F13 — Conexão IoT: config da integração pelo dono (JWT).
accessRouter.get('/integration', jwtAuth, mod, integration.getIntegration);
accessRouter.put('/integration', jwtAuth, mod, integration.setEnabled);
accessRouter.post('/integration/api-key/rotate', jwtAuth, mod, integration.rotateApiKey);
accessRouter.post('/integration/api-key/revoke', jwtAuth, mod, integration.revokeApiKey);
accessRouter.put('/integration/webhook', jwtAuth, mod, integration.setWebhook);
accessRouter.delete('/integration/webhook', jwtAuth, mod, integration.clearWebhook);
accessRouter.post('/integration/webhook/test', jwtAuth, mod, integration.testWebhook);
accessRouter.get('/events', jwtAuth, mod, integration.listEvents);

// F13 — PULL: a catraca pergunta se libera. Autentica por API key (x-api-key),
// não por JWT. Fora do gate de módulo (RN-M5): caminho de automação/dispositivo.
accessRouter.get('/check', accessApiKeyAuth, integration.check);
