import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const invoiceRouter = Router();
const invoiceController = new InvoiceController();


// Rota que o seu Front-end vai chamar para gerar uma cobrança manual (JWT)
invoiceRouter.post('/', jwtAuth, invoiceController.create);
// Webhook do gateway: a verificação de autenticidade é feita pelo provider ativo
// (mock: x-webhook-secret; mercadopago: assinatura x-signature).
invoiceRouter.post('/webhook', invoiceController.handleWebhook);
invoiceRouter.get('/overdue', jwtAuth, invoiceController.findPendingInvoices);



export { invoiceRouter };