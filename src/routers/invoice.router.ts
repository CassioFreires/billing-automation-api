import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';

const invoiceRouter = Router();
const invoiceController = new InvoiceController();

// Rota que o seu Front-end vai chamar para gerar uma cobrança manual
invoiceRouter.post('/invoices', invoiceController.create);

// Rota que o n8n vai chamar para atualizar o status quando receber o pagamento do gateway
invoiceRouter.post('/invoices/webhook', invoiceController.handleWebhook);

export { invoiceRouter };