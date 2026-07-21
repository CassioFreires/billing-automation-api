import { Router } from 'express';
import { OnboardingController } from '../controllers/onboarding.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const onboardingRouter = Router();

// Onboarding é por tenant → exige JWT. Sem gating de plano (spec 0021, RN-2106):
// precisa funcionar no trial, no Free e mesmo com a escrita bloqueada.
onboardingRouter.use(jwtAuth);

const controller = new OnboardingController();

onboardingRouter.get('/', controller.get.bind(controller));
onboardingRouter.patch('/', controller.update.bind(controller));

export { onboardingRouter };
