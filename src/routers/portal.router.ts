import { Router } from 'express';
import { PortalController } from '../controllers/portal.controller.js';
import { linkLimiter } from '../middlewares/rate-limit.middleware.js';

/**
 * Router PÚBLICO do Portal do pagador (spec 0027). Sem JWT — o cliente é
 * resolvido pelo `portalToken`. Rate-limit do link público.
 */
export const publicPortalRouter = Router();
const controller = new PortalController();

publicPortalRouter.get('/:token', linkLimiter, controller.getByToken);

// Aceite do contrato no celular (spec 0040) — público, rate-limited.
publicPortalRouter.post('/:token/contract/accept', linkLimiter, controller.acceptContract);

// PDF do contrato (spec 0041) — público, rate-limited.
publicPortalRouter.get('/:token/contract/file', linkLimiter, controller.getContractFile);
