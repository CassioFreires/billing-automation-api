import { Request, Response } from 'express';
import { PlatformSubscriptionService, BillingError } from '../services/platform-subscription.service.js';
import { validateCheckout } from '../dtos/checkout.dto.js';

/** Cobrança do próprio SaaS (spec 0020): plano, checkout, faturas, webhook. */
export class BillingController {
  private service: PlatformSubscriptionService;

  constructor() {
    this.service = new PlatformSubscriptionService();
  }

  getPlan = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.getStatus());
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? 'Erro ao ler o plano' });
    }
  };

  checkout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { plan } = validateCheckout(req.body);
      res.json(await this.service.checkout(plan));
    } catch (error: any) {
      if (error instanceof BillingError && error.code === 'INVALID_PLAN') {
        res.status(400).json({ error: 'Plano inválido' });
        return;
      }
      res.status(400).json({ error: error?.message ?? 'Erro no checkout' });
    }
  };

  listInvoices = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.listInvoices());
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? 'Erro ao listar faturas' });
    }
  };

  /** Webhook da cobrança de plataforma (público). */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = String(req.params.provider ?? '').toLowerCase();
      const result = await this.service.confirmPayment(provider, {
        headers: req.headers as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
        body: req.body,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      const msg = error?.message ?? '';
      if (msg === 'WEBHOOK_INVALID_SIGNATURE') {
        res.status(401).json({ error: 'Assinatura do webhook inválida' });
        return;
      }
      if (error instanceof BillingError && error.code === 'NOT_FOUND') {
        res.status(404).json({ error: 'Cobrança não encontrada' });
        return;
      }
      if (msg.includes('não configurado') || msg === 'WEBHOOK_NOT_CONFIGURED') {
        res.status(500).json({ error: 'Webhook não configurado' });
        return;
      }
      console.error('❌ Erro no webhook de plataforma:', error);
      res.status(400).json({ error: msg || 'Erro no processamento do webhook' });
    }
  };
}
