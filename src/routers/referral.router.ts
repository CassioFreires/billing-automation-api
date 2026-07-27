import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { linkLimiter, agreementLimiter } from '../middlewares/rate-limit.middleware.js';
import { ReferralController } from '../controllers/referral.controller.js';

const controller = new ReferralController();

/** Indique e Ganhe (spec 0046, F16) — dono (JWT). */
export const referralRouter = Router();
referralRouter.get('/settings', jwtAuth, controller.getSettings);
referralRouter.put('/settings', jwtAuth, controller.updateSettings);
referralRouter.get('/summary', jwtAuth, controller.summary);
referralRouter.get('/code/:clientId', jwtAuth, controller.code);
referralRouter.get('/', jwtAuth, controller.list);

/**
 * Link PÚBLICO de indicação (sem JWT — tenant resolvido pelo código).
 * Montado em `/api/public/referrals`. Captura cria cliente → rate-limit estreito.
 */
export const publicReferralRouter = Router();
publicReferralRouter.get('/:code', linkLimiter, controller.publicInfo);
publicReferralRouter.post('/:code', agreementLimiter, controller.capture);
