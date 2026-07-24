import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { linkLimiter, agreementLimiter } from '../middlewares/rate-limit.middleware.js';
import { OfferController } from '../controllers/offer.controller.js';

const controller = new OfferController();

/** Loja no Pagamento (spec 0044, F15) — CRUD das ofertas pelo DONO (JWT). */
export const offerRouter = Router();
offerRouter.get('/', jwtAuth, controller.list);
offerRouter.get('/summary', jwtAuth, controller.summary);
offerRouter.post('/', jwtAuth, controller.create);
offerRouter.put('/:id', jwtAuth, controller.update);
offerRouter.delete('/:id', jwtAuth, controller.remove);

/**
 * Vitrine PÚBLICA no checkout (sem JWT — tenant resolvido pela fatura via
 * linkToken). Montada em `/api/public/offers`. Aceitar gera cobrança → rate-limit
 * estreito (mesmo do acordo 0018).
 */
export const publicOfferRouter = Router();
publicOfferRouter.get('/:token', linkLimiter, controller.listForToken);
publicOfferRouter.post('/:token/accept', agreementLimiter, controller.accept);
