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
