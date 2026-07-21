import { Router } from 'express';
import { AgreementController } from '../controllers/agreement.controller.js';
import { linkLimiter, agreementLimiter } from '../middlewares/rate-limit.middleware.js';

/**
 * Router PÚBLICO da autonegociação (spec 0018 — M2). Sem JWT: o pagador não tem
 * sessão; o tenant é resolvido pela fatura (linkToken, RN-NEG7). Montado em
 * `/api/public/agreements`. Rate-limit próprio (aceite cria cobrança → estreito).
 */
export const publicAgreementRouter = Router();

const controller = new AgreementController();

publicAgreementRouter.get('/:token/options', linkLimiter, controller.getOptions);
publicAgreementRouter.post('/:token/pay-attempt', linkLimiter, controller.payAttempt);
publicAgreementRouter.post('/:token/accept', agreementLimiter, controller.accept);
