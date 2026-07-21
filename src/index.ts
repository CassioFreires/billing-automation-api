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
import { publicAgreementRouter } from './routers/agreement.router.js';
import { billingRouter } from './routers/billing.router.js';
import { adminRouter } from './routers/admin.router.js';
import { onboardingRouter } from './routers/onboarding.router.js';

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
// Cobrança do próprio SaaS (spec 0020): plano/checkout (JWT) + webhook (público).
appRouter.use('/billing', billingRouter);
// Painel super-admin (spec 0023): cross-tenant, restrito à allowlist de admins.
appRouter.use('/admin', adminRouter);
appRouter.use('/system', systemRouter);
appRouter.use('/lgpd', lgpdRouter);
appRouter.use('/cockpit', cockpitRouter);
// Autonegociação PÚBLICA (spec 0018 — M2): sem JWT, tenant resolvido pela fatura.
appRouter.use('/public/agreements', publicAgreementRouter);
appRouter.use('/health', healthRouter);

export { appRouter };
