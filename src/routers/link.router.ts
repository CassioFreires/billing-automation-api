import { Router } from 'express';
import { linkLimiter } from '../middlewares/rate-limit.middleware.js';
import { openLink } from '../controllers/link.controller.js';

/**
 * Router PÚBLICO do link do Elo (spec 0016). Montado na RAIZ (`/r`), FORA do
 * `/api` protegido por JWT — é o link que o pagador abre. Rate-limit próprio.
 */
export const linkRouter = Router();

linkRouter.get('/:token', linkLimiter, openLink);
