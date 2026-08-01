import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { linkLimiter, agreementLimiter } from '../middlewares/rate-limit.middleware.js';
import { OfferController } from '../controllers/offer.controller.js';

const controller = new OfferController();

/** Loja no Pagamento (spec 0044, F15) — CRUD pelo DONO (JWT). Gate do módulo `growth` (spec 0051). */
export const offerRouter = Router();
const mod = requireModule('growth');
offerRouter.get('/', jwtAuth, mod, controller.list);
offerRouter.get('/summary', jwtAuth, mod, controller.summary);
offerRouter.post('/', jwtAuth, mod, controller.create);
offerRouter.put('/:id', jwtAuth, mod, controller.update);
offerRouter.delete('/:id', jwtAuth, mod, controller.remove);

/**
 * Vitrine PÚBLICA no checkout (sem JWT — tenant resolvido pela fatura via
 * linkToken). Montada em `/api/public/offers`. Aceitar gera cobrança → rate-limit
 * estreito (mesmo do acordo 0018).
 */
export const publicOfferRouter = Router();
publicOfferRouter.get('/:token', linkLimiter, controller.listForToken);
publicOfferRouter.post('/:token/accept', agreementLimiter, controller.accept);
