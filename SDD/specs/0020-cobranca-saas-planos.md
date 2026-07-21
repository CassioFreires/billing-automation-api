# Spec 0020 — Cobrança do próprio SaaS (planos, trial, gating)

- **Status**: Implementada
- **Autor**: time Adimplo
- **Data**: 2026-07-21
- **Dívida relacionada**: introduz **D-24** (gateway REAL da plataforma + cobrança automática de renovação em produção; hoje mock). Reusa o seam de pagamento (spec 0019) e o padrão de webhook atômico (spec 0003/RN-P3).

## 1. Problema / Motivação

A Adimplo não tinha como **cobrar seus próprios tenants** — qualquer conta usava tudo, de
graça, para sempre. É o bloqueador nº 1 de receita. Precisamos de planos, trial, cobrança
da assinatura e bloqueio por inadimplência.

## 2. Objetivo

Planos **Free / Essencial / Pro**, **trial de 14 dias (recursos Pro)** em toda conta nova,
**gating** que bloqueia ESCRITA quando o trial/assinatura expira (leitura liberada), e
**cobrança da assinatura** via gateway de PLATAFORMA (mock agora, pronto p/ real). Distinto
de `Subscription` (o tenant cobrando os clientes DELE).

**Fora de escopo:** conta real de gateway da Adimplo e cobrança automática de renovação em
produção (D-24); troca de plano com pró-rata; múltiplos usuários por conta.

## 3. Regras de negócio

- **RN-SB1**: catálogo em `domain/plans.ts` — free (R$0, 20 fat/mês, sem Alívio, marca Adimplo),
  essencial (R$49, 200 fat/mês), pro (R$199, ilimitado, com Botão de Alívio). Ajustável.
- **RN-SB2**: conta nova nasce `trialing`/`pro`, `trialEndsAt = signup + 14d` (hook atômico no
  `createAccountWithOwner`). Contas pré-existentes são **grandfathered** no backfill (active/pro,
  período distante) — nunca bloqueadas.
- **RN-SB3** (entitlements): trial vigente → recursos Pro; `active` com período vigente → recursos
  do plano; trial expirado / período vencido / `past_due` / `canceled` → **só leitura**.
- **RN-SB4** (gating): ações de ESCRITA (POST/PUT/DELETE) em clients/invoices/subscriptions →
  **402 PLAN_EXPIRED** quando `!canWrite`. GET liberado; token `role:'service'` (cron/worker) passa.
- **RN-SB5** (quota): emitir fatura acima do limite mensal do plano → **402 PLAN_LIMIT_REACHED**.
- **RN-SB6** (feature gate): ligar o Botão de Alívio exige plano com `features.reliefButton`
  (Pro/trial) → senão **402 PLAN_FEATURE_REQUIRED**.
- **RN-SB7** (cobrança): checkout de plano pago cria `PlatformInvoice` e cobra via gateway de
  plataforma; o webhook confirma → `status:'active'`, `plan`, `currentPeriodEnd = +1 mês`
  (atômico e idempotente).

## 4. Impacto no modelo de dados

- `PlatformSubscription` (1:1 Account): plan, status, trialEndsAt, currentPeriodEnd.
- `PlatformInvoice`: plan, amountCents, period, status, gatewayId @unique, checkout/pix, paidAt.
- Migration `20260723000000_platform_billing` (aditiva/idempotente) + **backfill grandfather**.

## 5. Contrato de API

```
GET  /api/billing/plan        → { plan, status, trialEndsAt, currentPeriodEnd,
                                   entitlements, usage:{invoicesThisMonth,max,overQuota}, catalog }
POST /api/billing/checkout    { plan } → { switched } | { platformInvoiceId, checkoutUrl?, pixCopyPaste? }
GET  /api/billing/invoices    → PlatformInvoice[]
POST /api/billing/webhook/:provider  (público) → ativa/renova (idempotente)
POST /api/system/platform-billing/run  (x-cron-secret) → varredura (expira trials/períodos)
```
Gating: 402 `{error, code}` com code ∈ { PLAN_EXPIRED, PLAN_LIMIT_REACHED, PLAN_FEATURE_REQUIRED }.

## 6. Fluxo

- **Signup** → cria conta + trial (14d Pro).
- **Uso** → `requireWriteAccess` (após `jwtAuth`) consulta entitlements por request; escrita
  bloqueada quando expira. Quota checada em `POST /invoices`.
- **Upgrade** → `checkout(plan)`: free troca na hora; pago cria PlatformInvoice + `resolvePlatformGateway().createCharge` → checkout/PIX. Webhook `confirmPaidAtomic` ativa/renova.
- **Cron** → `runRenewals` marca trials/períodos vencidos como `past_due`.

## 7. Camadas afetadas

- [x] Domínio — `domain/plans.ts`
- [x] DTO — `dtos/checkout.dto.ts`
- [x] Repository — `repositories/platform-subscription.repository.ts`, `platform-invoice.repository.ts`, `invoice.repository.ts` (countCreatedThisMonth)
- [x] Service — `services/platform-subscription.service.ts`, `negotiation-setting.service.ts` (feature gate)
- [x] Controller — `controllers/billing.controller.ts`, `system.controller.ts`, `settings.controller.ts`
- [x] Router — `routers/billing.router.ts`, `system.router.ts`, `{invoice,clients,subscription}.router.ts`, `index.ts`
- [x] Middleware — `middlewares/require-plan.middleware.ts`
- [x] Integração — `apis/payment/index.ts` (resolvePlatformGateway)
- [x] Schema/migration; signup hook em `repositories/user.repository.ts`
- [x] Front — billing.service, useBilling, PlanPage, SideBar, AppShell (banner+paywall), api.ts (402), App.tsx

## 8. Critérios de aceite

- [x] Conta nova nasce em trial de 14 dias (Pro).
- [x] Trial/assinatura expirada bloqueia escrita (402) mas permite leitura.
- [x] Quota por plano barra a emissão de faturas acima do limite.
- [x] Botão de Alívio exige Pro/trial.
- [x] Checkout pago gera cobrança (mock) e o webhook ativa/renova (idempotente).
- [x] Contas pré-existentes não são bloqueadas (grandfather).
- [x] Build limpo; suíte verde (233 testes).

## 9. Riscos / considerações

- **Gateway de plataforma é mock** (D-24): em produção, definir `PLATFORM_PAYMENT_PROVIDER` +
  credenciais reais da conta da Adimplo e a cobrança automática de renovação (hoje o cron só
  marca `past_due`; a renovação-cobrança fica manual/mock).
- Gating consulta o plano por request (sem claim no JWT) — custo de 1 query; aceitável, cacheável
  depois se necessário.
- Recorrência do tenant (`createForSubscription`) fica FORA da quota na v1 (não quebrar o sweep).

## 10. Notas de implementação

- Backfill grandfather via `INSERT ... SELECT` para contas sem assinatura (active/pro, período
  +100 anos). Validado no E2E local.
- Reuso: `utils/recurrence.ts` (periodOf), padrão `applyWebhookAtomic`, `resolvePaymentGateway*`,
  `PixBox`/`STATUS_META` no front.
