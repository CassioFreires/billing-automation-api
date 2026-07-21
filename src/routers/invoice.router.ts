import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';
import { PaymentController } from '../controllers/payment.controller.js';
import { AgreementController } from '../controllers/agreement.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const invoiceRouter = Router();
const invoiceController = new InvoiceController();
const paymentController = new PaymentController();
const agreementController = new AgreementController();


// Rota que o seu Front-end vai chamar para gerar uma cobrança manual (JWT)
invoiceRouter.post('/', jwtAuth, invoiceController.create);
// Webhook do gateway: a verificação de autenticidade é feita pelo provider ativo
// (mock: x-webhook-secret; mercadopago: assinatura x-signature).
invoiceRouter.post('/webhook', invoiceController.handleWebhook);

// Consultas (JWT). ATENÇÃO à ordem: rotas literais ('/overdue') ANTES da
// paramétrica ('/:id'), senão '/overdue' cairia no handler de ':id'.
invoiceRouter.get('/', jwtAuth, invoiceController.findAll);
invoiceRouter.get('/overdue', jwtAuth, invoiceController.findPendingInvoices);
invoiceRouter.get('/:id', jwtAuth, invoiceController.findById);

// Recebimentos da fatura (spec 0015): baixa manual e listagem (JWT).
invoiceRouter.post('/:id/payments', jwtAuth, paymentController.register);
invoiceRouter.get('/:id/payments', jwtAuth, paymentController.listByInvoice);

// Eventos de interação da fatura (Elo, spec 0016): timeline + contagens (JWT).
invoiceRouter.get('/:id/events', jwtAuth, invoiceController.getEvents);

// Acordo de autonegociação da fatura (spec 0018 — M2): estado p/ o painel (JWT).
invoiceRouter.get('/:id/agreement', jwtAuth, agreementController.getForInvoice);


export { invoiceRouter };