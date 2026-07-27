import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { FiscalController } from '../controllers/fiscal.controller.js';

const controller = new FiscalController();

/** NFS-e / Nota Fiscal (spec 0047, F7) — dono (JWT). */
export const fiscalRouter = Router();
fiscalRouter.get('/settings', jwtAuth, controller.getSettings);
fiscalRouter.put('/settings', jwtAuth, controller.updateSettings);
fiscalRouter.get('/documents', jwtAuth, controller.list);
fiscalRouter.post('/invoices/:invoiceId/emit', jwtAuth, controller.emit);
fiscalRouter.post('/invoices/:invoiceId/cancel', jwtAuth, controller.cancel);

/** Webhook PÚBLICO do provider fiscal (sem JWT — assinatura verificada no service). */
export const publicFiscalRouter = Router();
publicFiscalRouter.post('/webhook/:provider', controller.webhook);
