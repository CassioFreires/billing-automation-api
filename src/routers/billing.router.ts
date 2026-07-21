import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const billingRouter = Router();
const controller = new BillingController();

// Webhook da cobrança de plataforma: PÚBLICO (verificação de assinatura no
// provider). Vem ANTES do jwtAuth para não exigir token (spec 0020).
billingRouter.post('/webhook/:provider', controller.handleWebhook);

// Demais rotas são do tenant logado → exigem JWT.
billingRouter.use(jwtAuth);
billingRouter.get('/plan', controller.getPlan);
billingRouter.get('/invoices', controller.listInvoices);
billingRouter.post('/checkout', controller.checkout);

export { billingRouter };
