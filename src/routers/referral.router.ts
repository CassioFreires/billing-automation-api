import { Router } from 'express';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireModule } from '../middlewares/require-module.middleware.js';
import { linkLimiter, agreementLimiter } from '../middlewares/rate-limit.middleware.js';
import { ReferralController } from '../controllers/referral.controller.js';

const controller = new ReferralController();

/** Indique e Ganhe (spec 0046, F16) — dono (JWT). Gate do módulo `growth` (spec 0051). */
export const referralRouter = Router();
const mod = requireModule('growth');
referralRouter.get('/settings', jwtAuth, mod, controller.getSettings);
referralRouter.put('/settings', jwtAuth, mod, controller.updateSettings);
referralRouter.get('/summary', jwtAuth, mod, controller.summary);
referralRouter.get('/code/:clientId', jwtAuth, mod, controller.code);
referralRouter.get('/', jwtAuth, mod, controller.list);

/**
 * Link PÚBLICO de indicação (sem JWT — tenant resolvido pelo código).
 * Montado em `/api/public/referrals`. Captura cria cliente → rate-limit estreito.
 */
export const publicReferralRouter = Router();
publicReferralRouter.get('/:code', linkLimiter, controller.publicInfo);
publicReferralRouter.post('/:code', agreementLimiter, controller.capture);
