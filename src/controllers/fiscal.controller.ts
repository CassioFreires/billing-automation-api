import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { FiscalService, FiscalError, FE } from '../services/fiscal.service.js';
import { FiscalValidationError } from '../domain/fiscal.js';
import { validateFiscalSettings } from '../dtos/fiscal.dto.js';

/**
 * NFS-e / Nota Fiscal (spec 0047, F7).
 * - DONO (JWT): config, lista, emitir/cancelar a nota de uma fatura.
 * - PÚBLICO: webhook do provider (`/api/fiscal/webhook/:provider`) — assinatura verificada.
 */
export class FiscalController {
  private service: FiscalService;
  constructor() {
    this.service = new FiscalService();
  }

  getSettings = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await this.service.getSettings()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const dto = validateFiscalSettings(req.body);
      return res.status(200).json(await this.service.updateSettings(dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      if (e instanceof FiscalError) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };

  list = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await this.service.list()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
  };

  emit = async (req: Request, res: Response) => {
    try {
      const doc = await this.service.emitForInvoice(String(req.params.invoiceId));
      return res.status(201).json(doc);
    } catch (e: any) {
      if (e instanceof FiscalValidationError) return res.status(422).json({ error: e.message });
      if (e instanceof FiscalError) {
        if (e.message === FE.DISABLED) return res.status(409).json({ error: 'Nota fiscal não está ativada nesta conta.' });
        if (e.message === FE.INVOICE_NOT_FOUND) return res.status(404).json({ error: 'Fatura não encontrada.' });
      }
      console.error('❌ emit NFS-e:', e);
      return res.status(500).json({ error: 'Não foi possível emitir a nota.' });
    }
  };

  cancel = async (req: Request, res: Response) => {
    try {
      const doc = await this.service.cancelForInvoice(String(req.params.invoiceId));
      return res.status(200).json(doc);
    } catch (e: any) {
      if (e instanceof FiscalError) {
        if (e.message === FE.DOC_NOT_FOUND) return res.status(404).json({ error: 'Esta fatura não tem nota emitida.' });
        if (e.message === FE.NOT_CANCELLABLE) return res.status(409).json({ error: 'Só uma nota emitida pode ser cancelada.' });
      }
      console.error('❌ cancel NFS-e:', e);
      return res.status(500).json({ error: 'Não foi possível cancelar a nota.' });
    }
  };

  /** Webhook público do provider fiscal (assinatura verificada no service). */
  webhook = async (req: Request<{ provider: string }>, res: Response) => {
    try {
      const result = await this.service.applyWebhook(req.params.provider, {
        headers: req.headers as Record<string, unknown>,
        body: req.body,
        rawBody: (req as any).rawBody,
      });
      return res.status(200).json(result);
    } catch (e: any) {
      console.error('❌ webhook NFS-e:', e);
      return res.status(200).json({ ignored: true }); // sempre 200 pro provider não reenfileirar
    }
  };
}
