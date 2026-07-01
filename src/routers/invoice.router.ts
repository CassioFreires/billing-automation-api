import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { webhookAuth } from '../middlewares/webhook.middleware.js';

const invoiceRouter = Router();
const invoiceController = new InvoiceController();


// Rota que o seu Front-end vai chamar para gerar uma cobrança manual (JWT)
invoiceRouter.post('/', jwtAuth, invoiceController.create);
// Rota que o gateway/n8n chama ao confirmar pagamento (segredo do webhook, não JWT)
invoiceRouter.post('/webhook', webhookAuth, invoiceController.handleWebhook);
invoiceRouter.get('/overdue', jwtAuth, invoiceController.findPendingInvoices);



export { invoiceRouter };