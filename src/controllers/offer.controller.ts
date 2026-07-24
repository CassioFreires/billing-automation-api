import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { OfferService, OfferError } from '../services/offer.service.js';
import { OfferValidationError } from '../domain/offer.js';
import { validateOfferCreate, validateOfferUpdate, validateOfferAccept } from '../dtos/offer.dto.js';

/**
 * Loja no Pagamento (spec 0044, F15).
 * - DONO (JWT): CRUD das ofertas + resumo.
 * - PÚBLICO (checkout do Elo, sem JWT): listar ofertas ativas e aceitar uma.
 */
export class OfferController {
  private service: OfferService;

  constructor() {
    this.service = new OfferService();
  }

  // --- Dono (JWT) ---
  list = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.list());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  summary = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.summary());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const dto = validateOfferCreate(req.body);
      return res.status(201).json(await this.service.create(dto));
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      if (e instanceof OfferValidationError) return res.status(400).json({ error: e.message });
      return res.status(500).json({ error: e.message });
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const dto = validateOfferUpdate(req.body);
      const updated = await this.service.update(String(req.params.id), dto);
      return res.status(200).json(updated);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: e.issues });
      if (e instanceof OfferValidationError) return res.status(400).json({ error: e.message });
      if (e?.message === OfferError.OFFER_NOT_FOUND) return res.status(404).json({ error: 'Oferta não encontrada.' });
      return res.status(500).json({ error: e.message });
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      await this.service.remove(String(req.params.id));
      return res.status(204).send();
    } catch (e: any) {
      if (e?.message === OfferError.OFFER_NOT_FOUND) return res.status(404).json({ error: 'Oferta não encontrada.' });
      if (e?.message === OfferError.HAS_PURCHASES) {
        return res.status(409).json({ error: 'Oferta já tem compras — desative em vez de apagar.' });
      }
      return res.status(500).json({ error: e.message });
    }
  };

  // --- Público (checkout) ---
  listForToken = async (req: Request<{ token: string }>, res: Response) => {
    try {
      return res.status(200).json(await this.service.listForToken(req.params.token));
    } catch (e: any) {
      if (e?.message === OfferError.INVOICE_NOT_FOUND) return res.status(404).json({ error: 'Link inválido ou expirado.' });
      return res.status(500).json({ error: 'Erro ao carregar as ofertas.' });
    }
  };

  accept = async (req: Request<{ token: string }>, res: Response) => {
    try {
      const dto = validateOfferAccept(req.body);
      const result = await this.service.acceptOffer(req.params.token, dto.offerId);
      return res.status(201).json(result);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos.' });
      if (e?.message === OfferError.INVOICE_NOT_FOUND) return res.status(404).json({ error: 'Link inválido ou expirado.' });
      if (e?.message === OfferError.OFFER_NOT_FOUND) return res.status(404).json({ error: 'Oferta não encontrada.' });
      if (e?.message === OfferError.OFFER_INACTIVE) return res.status(409).json({ error: 'Esta oferta não está mais disponível.' });
      console.error('❌ accept offer:', e);
      return res.status(500).json({ error: 'Não foi possível concluir a compra.' });
    }
  };
}
