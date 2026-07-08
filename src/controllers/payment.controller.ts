import { Request, Response } from 'express';
import { PaymentService, NotFoundError, ConflictError } from '../services/payment.service.js';
import { registerManualPaymentSchema } from '../dtos/payment.dto.js';

export class PaymentController {
  private service: PaymentService;

  constructor() {
    this.service = new PaymentService();
  }

  /** POST /api/invoices/:id/payments — baixa manual. */
  register = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const dto = registerManualPaymentSchema.parse(req.body);
      const result = await this.service.registerManual(req.params.id, dto);
      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(400).json({ error: error.message ?? 'Erro ao registrar pagamento' });
    }
  };

  /** GET /api/invoices/:id/payments — lista os recebimentos da fatura. */
  listByInvoice = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const payments = await this.service.listByInvoice(req.params.id);
      res.status(200).json({ payments });
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error.message });
    }
  };
}
