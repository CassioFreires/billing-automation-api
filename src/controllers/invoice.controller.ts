import { Request, Response } from 'express';
import { InvoiceService } from '../services/invoice.service.js';
import { createInvoiceSchema } from '../dtos/createInvoice.dto.js';
import { validateImportInvoices } from '../dtos/importInvoices.dto.js';
import { PaymentGatewayAPI } from '../apis/payment/index.js';

export class InvoiceController {
  private invoiceService: InvoiceService;
  private gateway: PaymentGatewayAPI;

  constructor() {
    this.invoiceService = new InvoiceService();
    this.gateway = new PaymentGatewayAPI();
  }

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedData = createInvoiceSchema.parse(req.body);
      const invoice = await this.invoiceService.createPayment(validatedData);
      res.status(201).json(invoice);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Erro ao criar cobrança' });
    }
  };

  /** Importação de faturas em lote via CSV (spec 0024). */
  import = async (req: Request, res: Response): Promise<void> => {
    try {
      const { invoices } = validateImportInvoices(req.body);
      const result = await this.invoiceService.importInvoices(invoices);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Erro ao importar faturas' });
    }
  };

  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      // A verificação de autenticidade é do provider ativo (RN-P4).
      const event = await this.gateway.verifyAndParseWebhook({
        headers: req.headers as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
        body: req.body,
      });

      // Evento não relevante (ex.: notificação que não é de pagamento).
      if (!event) {
        res.status(200).json({ success: true, ignored: true });
        return;
      }

      const result = await this.invoiceService.applyWebhook(event);
      res.status(200).json({ success: true, duplicate: result.duplicate });
    } catch (error: any) {
      this.mapWebhookError(error, res);
    }
  };

  /**
   * Webhook multi-gateway (spec 0019): `POST /webhook/:provider`. Resolve o
   * provider pela URL, localiza o tenant pela referência do payload e verifica
   * a assinatura com a credencial daquele tenant (no service).
   */
  handleWebhookByProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = String(req.params.provider ?? '').toLowerCase();
      const result = await this.invoiceService.applyWebhookForProvider(provider, {
        headers: req.headers as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
        body: req.body,
      });
      res.status(200).json({
        success: true,
        ignored: result.ignored,
        duplicate: result.duplicate,
      });
    } catch (error: any) {
      this.mapWebhookError(error, res);
    }
  };

  /** Mapeia erros de webhook para status HTTP (compartilhado pelos dois handlers). */
  private mapWebhookError(error: any, res: Response): void {
    const msg = error?.message ?? '';
    if (msg === 'WEBHOOK_INVALID_SIGNATURE') {
      res.status(401).json({ error: 'Assinatura do webhook inválida' });
      return;
    }
    if (msg.includes('não configurado') || msg === 'WEBHOOK_NOT_CONFIGURED') {
      console.error('❌ Webhook mal configurado:', msg);
      res.status(500).json({ error: 'Webhook não configurado' });
      return;
    }
    if (msg.includes('não encontrada')) {
      res.status(404).json({ error: msg });
      return;
    }
    console.error('❌ Erro no webhook:', error);
    res.status(400).json({ error: msg || 'Erro no processamento do webhook' });
  }

  private static readonly VALID_STATUS = ['PENDING', 'PAID', 'OVERDUE', 'FAILED'];

  findAll = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string | undefined;

      if (status && !InvoiceController.VALID_STATUS.includes(status)) {
        return res.status(400).json({
          error: `status inválido. Use um de: ${InvoiceController.VALID_STATUS.join(', ')}`,
        });
      }

      const result = await this.invoiceService.listInvoices(page, limit, status);
      return res.status(200).json({ message: 'OK', result });
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };

  findById = async (req: Request<{ id: string }>, res: Response) => {
    try {
      const invoice = await this.invoiceService.getInvoiceById(req.params.id);

      if (!invoice) {
        return res.status(404).json({ error: 'Fatura não encontrada' });
      }

      return res.status(200).json(invoice);
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };

  getEvents = async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await this.invoiceService.getInvoiceEvents(req.params.id);

      if (!result) {
        return res.status(404).json({ error: 'Fatura não encontrada' });
      }

      return res.status(200).json(result);
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };

  findPendingInvoices = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.invoiceService.findPendingInvoices(page, limit);

      if (!result.invoices || result.invoices.length === 0) {
        return res.status(404).json({ message: 'Nenhuma fatura pendente encontrada', result: { invoices: [], meta: {} } });
      }

      return res.status(200).json({ message: 'OK', result });
    } catch (error: any) {
      console.error(error.message);
      return res.status(500).json({ message: error.message });
    }
  };
}
