import { InvoiceService } from '../services/invoice.service.js';
import { createInvoiceSchema, updateInvoiceStatusSchema } from '../dtos/createInvoice.dto.js';
export class InvoiceController {
    invoiceService;
    constructor() {
        this.invoiceService = new InvoiceService();
    }
    create = async (req, res) => {
        try {
            // Camada de Validação do DTO
            const validatedData = createInvoiceSchema.parse(req.body);
            const invoice = await this.invoiceService.createPayment(validatedData);
            res.status(201).json(invoice);
        }
        catch (error) {
            res.status(400).json({ error: error.message || "Erro ao criar cobrança" });
        }
    };
    handleWebhook = async (req, res) => {
        try {
            // Valida se o formato enviado pelo n8n/Gateway está correto
            const validatedData = updateInvoiceStatusSchema.parse(req.body);
            const updatedInvoice = await this.invoiceService.receiveWebhookNotification(validatedData);
            res.status(200).json({ success: true, invoice: updatedInvoice });
        }
        catch (error) {
            res.status(400).json({ error: error.message || "Erro no processamento do webhook" });
        }
    };
}
