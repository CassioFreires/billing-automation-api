import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { FiscalController } from '../controllers/fiscal.controller.js';

const controller = new FiscalController();

/** NFS-e / Nota Fiscal (spec 0047, F7) — dono (JWT). Gate do módulo `fiscal` (spec 0051). */
export const fiscalRouter = Router();
const mod = requireModule('fiscal');
fiscalRouter.get('/settings', jwtAuth, mod, controller.getSettings);
fiscalRouter.put('/settings', jwtAuth, mod, controller.updateSettings);
fiscalRouter.get('/documents', jwtAuth, mod, controller.list);
fiscalRouter.post('/invoices/:invoiceId/emit', jwtAuth, mod, controller.emit);
fiscalRouter.post('/invoices/:invoiceId/cancel', jwtAuth, mod, controller.cancel);

/** Webhook PÚBLICO do provider fiscal (sem JWT — assinatura verificada no service). */
export const publicFiscalRouter = Router();
publicFiscalRouter.post('/webhook/:provider', controller.webhook);
