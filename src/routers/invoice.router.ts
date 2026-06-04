import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';

const invoiceRouter = Router();
const invoiceController = new InvoiceController();


// Rota que o seu Front-end vai chamar para gerar uma cobrança manual
invoiceRouter.post('/', invoiceController.create);
// Rota que o n8n vai chamar para atualizar o status quando receber o pagamento do gateway
invoiceRouter.post('/webhook', invoiceController.handleWebhook);
invoiceRouter.get('/overdue', invoiceController.findPendingInvoices);



export { invoiceRouter };