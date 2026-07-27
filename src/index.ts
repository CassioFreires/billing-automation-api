import { Router } from 'express';
import { authLimiter, apiLimiter } from './middlewares/rate-limit.middleware.js';
import { authRouter } from './routers/auth.router.js';
import { notificationRouter } from './routers/notification.router.js';
import { clientRouter } from './routers/clients.router.js';
import { invoiceRouter } from './routers/invoice.router.js';
import { subscriptionRouter } from './routers/subscription.router.js';
import { systemRouter } from './routers/system.router.js';
import { settingsRouter } from './routers/settings.router.js';
import { healthRouter } from './routers/health.router.js';
import { lgpdRouter } from './routers/lgpd.router.js';
import { cockpitRouter } from './routers/cockpit.router.js';
import { recoveryRouter } from './routers/recovery.router.js';
import { retentionRouter } from './routers/retention.router.js';
import { contractRouter } from './routers/contract.router.js';
import { accessRouter } from './routers/access.router.js';
import { offerRouter, publicOfferRouter } from './routers/offer.router.js';
import { winbackRouter } from './routers/winback.router.js';
import { referralRouter, publicReferralRouter } from './routers/referral.router.js';
import { fiscalRouter, publicFiscalRouter } from './routers/fiscal.router.js';
import { publicAgreementRouter } from './routers/agreement.router.js';
import { publicPortalRouter } from './routers/portal.router.js';
import { billingRouter } from './routers/billing.router.js';
import { adminRouter } from './routers/admin.router.js';
import { onboardingRouter } from './routers/onboarding.router.js';
import { teamRouter } from './routers/team.router.js';

const appRouter = Router();

// Limite geral folgado em toda a API; auth tem um limite mais estrito abaixo.
appRouter.use(apiLimiter);

/**
 * Agregador de rotas da aplicação.
 * Tudo aqui é montado sob o prefixo `/api` no server.ts.
 *
 * Acesso:
 *   /auth      → público (emite JWT)
 *   /health    → público
 *   /clients, /notifications, /invoices, /subscriptions (exceto webhook) → exigem JWT
 *   /invoices/webhook → exige segredo do webhook (x-webhook-secret)
 *   /system → exige segredo de sistema (x-cron-secret) — operações cross-tenant
 */
appRouter.use('/auth', authLimiter, authRouter);
appRouter.use('/notifications', notificationRouter);
appRouter.use('/clients', clientRouter);
appRouter.use('/invoices', invoiceRouter);
appRouter.use('/subscriptions', subscriptionRouter);
appRouter.use('/settings', settingsRouter);
// Onboarding guiado do tenant (spec 0021): checklist de ativação (JWT, sem gating).
appRouter.use('/onboarding', onboardingRouter);
// Gestão de equipe do tenant (spec 0030): OWNER/ADMIN gerenciam usuários e papéis.
appRouter.use('/team', teamRouter);
// Cobrança do próprio SaaS (spec 0020): plano/checkout (JWT) + webhook (público).
appRouter.use('/billing', billingRouter);
// Painel super-admin (spec 0023): cross-tenant, restrito à allowlist de admins.
appRouter.use('/admin', adminRouter);
appRouter.use('/system', systemRouter);
appRouter.use('/lgpd', lgpdRouter);
appRouter.use('/cockpit', cockpitRouter);
// Recuperação de pagamento falho (spec 0033, F1): casos do dono (JWT).
appRouter.use('/recovery', recoveryRouter);

appRouter.use('/retention', retentionRouter);

appRouter.use('/contract', contractRouter);

appRouter.use('/access', accessRouter);
// Loja no Pagamento (spec 0044, F15): CRUD do dono (JWT).
appRouter.use('/offers', offerRouter);
// Winback / reativação (spec 0045, F5): config + métrica do dono (JWT).
appRouter.use('/winback', winbackRouter);
// Indique e Ganhe (spec 0046, F16): config + código do dono (JWT).
appRouter.use('/referrals', referralRouter);
// NFS-e / Nota Fiscal (spec 0047, F7): config + emitir/cancelar do dono (JWT).
appRouter.use('/fiscal', fiscalRouter);
// Autonegociação PÚBLICA (spec 0018 — M2): sem JWT, tenant resolvido pela fatura.
appRouter.use('/public/agreements', publicAgreementRouter);
// Vitrine PÚBLICA da Loja no Pagamento (spec 0044): sem JWT, tenant pela fatura.
appRouter.use('/public/offers', publicOfferRouter);
// Link PÚBLICO de indicação (spec 0046): sem JWT, tenant resolvido pelo código.
appRouter.use('/public/referrals', publicReferralRouter);
// Webhook PÚBLICO do provider fiscal (spec 0047): sem JWT, assinatura verificada.
appRouter.use('/fiscal', publicFiscalRouter);
// Portal do pagador PÚBLICO (spec 0027): sem JWT, cliente resolvido pelo portalToken.
appRouter.use('/public/portal', publicPortalRouter);
appRouter.use('/health', healthRouter);

export { appRouter };
