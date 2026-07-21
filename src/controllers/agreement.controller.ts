import { Request, Response } from 'express';
import { NegotiationService, NegotiationError } from '../services/negotiation.service.js';
import { validateAcceptAgreement } from '../dtos/acceptAgreement.dto.js';

/**
 * Autonegociação (spec 0018 — M2). Rotas PÚBLICAS (`/api/public/agreements/*`,
 * sem JWT — resolvem o tenant pela fatura via linkToken) + a leitura interna
 * do acordo de uma fatura (JWT).
 */
export class AgreementController {
  private service: NegotiationService;

  constructor() {
    this.service = new NegotiationService();
  }

  /** GET /api/public/agreements/:token/options — dados da página do pagador. */
  getOptions = async (req: Request<{ token: string }>, res: Response) => {
    try {
      const data = await this.service.getOptions(req.params.token);
      return res.status(200).json(data);
    } catch (error: any) {
      if (error?.message === NegotiationError.INVOICE_NOT_FOUND) {
        return res.status(404).json({ error: 'Link inválido ou expirado.' });
      }
      console.error('❌ getOptions:', error);
      return res.status(500).json({ error: 'Erro ao carregar a cobrança.' });
    }
  };

  /** POST /api/public/agreements/:token/accept — aceita uma opção de alívio. */
  accept = async (req: Request<{ token: string }>, res: Response) => {
    try {
      const dto = validateAcceptAgreement(req.body);
      const result = await this.service.accept(req.params.token, dto);
      return res.status(result.created ? 201 : 200).json(result.agreement);
    } catch (error: any) {
      const msg = error?.message ?? '';
      if (msg === NegotiationError.INVOICE_NOT_FOUND) {
        return res.status(404).json({ error: 'Link inválido ou expirado.' });
      }
      if (msg === NegotiationError.NOT_ELIGIBLE) {
        return res.status(409).json({ error: 'Esta cobrança não está elegível para acordo.' });
      }
      if (error?.name === 'NegotiationRuleError') {
        return res.status(422).json({ error: msg });
      }
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: 'Dados do acordo inválidos.' });
      }
      console.error('❌ accept agreement:', error);
      return res.status(500).json({ error: 'Erro ao registrar o acordo.' });
    }
  };

  /** POST /api/public/agreements/:token/pay-attempt — registra a intenção de pagar. */
  payAttempt = async (req: Request<{ token: string }>, res: Response) => {
    try {
      const data = await this.service.payAttempt(req.params.token);
      return res.status(200).json(data);
    } catch (error: any) {
      if (error?.message === NegotiationError.INVOICE_NOT_FOUND) {
        return res.status(404).json({ error: 'Link inválido ou expirado.' });
      }
      console.error('❌ payAttempt:', error);
      return res.status(500).json({ error: 'Erro ao registrar a tentativa.' });
    }
  };

  /** GET /api/invoices/:id/agreement — acordo da fatura (JWT, painel do dono). */
  getForInvoice = async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await this.service.getAgreementForInvoice(req.params.id);
      if (!result) return res.status(404).json({ error: 'Fatura não encontrada' });
      return res.status(200).json(result);
    } catch (error: any) {
      console.error('❌ getForInvoice agreement:', error);
      return res.status(500).json({ error: error.message });
    }
  };
}
