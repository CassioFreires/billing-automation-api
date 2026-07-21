# Spec 0023 — Painel Super-Admin (gestão de tenants)

- **Status**: Implementada
- **Autor**: time Adimplo
- **Data**: 2026-07-21
- **Dívida relacionada**: reusa o gating da spec 0020 (Account.status → entitlements). Sem nova dívida obrigatória (ver §9 p/ endurecimentos futuros).

## 1. Problema / Motivação

O dono da plataforma (Adimplo) não tinha visão nem controle cross-tenant: sem métricas de
negócio (MRR), sem gerir contas (suspender/mudar plano) e sem operar suporte (impersonar).
Suporte virava mexer no banco. Sem isso, não dá pra operar/vender com segurança.

## 2. Objetivo

Painel `/admin` restrito por allowlist de e-mails: métricas (MRR, contagem por status, trials
expirando), lista/busca de tenants com uso, e operações — suspender/reativar, mudar plano,
impersonar (com auditoria). Suspender **bloqueia escrita** (reusa o gating do plano).

**Fora de escopo:** RBAC multiusuário por tenant (spec futura); painel de auditoria na UI;
métricas históricas/gráficos; billing real da plataforma (D-24).

## 3. Regras de negócio (segurança)

- **RN-AD1**: super-admin = e-mail em `PLATFORM_ADMIN_EMAILS` (CSV no env, case-insensitive).
  `requirePlatformAdmin` (após `jwtAuth`) carrega o User por `sub` e confere; não-admin → **403**.
- **RN-AD2**: rotas admin leem/escrevem **cross-tenant** (queries GLOBAIS, sem `requireTenantId`) —
  entrada legítima, isolada no `admin.repository`.
- **RN-AD3**: toda ação sensível (suspend/activate/change_plan/impersonate) grava `AdminAuditLog`
  (adminEmail, action, targetTenantId, meta, createdAt).
- **RN-AD4**: **suspender** → `Account.status='SUSPENDED'` → `resolveEntitlements` retorna
  `canWrite:false` (reason `SUSPENDED`). Leitura permanece. `activate` reverte.
- **RN-AD5**: **impersonação** emite JWT do OWNER do tenant, **curto** (`IMPERSONATION_EXPIRES_IN`,
  default 30m), marcado com `imp: <adminEmail>` para rastreio.
- **RN-AD6**: MRR = Σ `PLANS[plan].priceCents` das assinaturas `active`, plano pago e período vigente.

## 4. Impacto no modelo de dados

- `AdminAuditLog` (novo) — migration `20260724000000_admin_audit` (aditiva/idempotente).
- `Account.status` (já existia) passa a ser LIDO no gating. Sem alteração de coluna.

## 5. Contrato de API (todas exigem jwtAuth + requirePlatformAdmin)

```
GET  /api/admin/me                         → { isPlatformAdmin, email }
GET  /api/admin/metrics                    → { totalTenants, byStatus, mrrCents, trialsExpiringSoon }
GET  /api/admin/tenants?search=&page=      → { tenants[], total, page, limit }
GET  /api/admin/tenants/:id                → detalhe (subscription, counts, últimas PlatformInvoice, users)
POST /api/admin/tenants/:id/suspend        → { success, status:'SUSPENDED' }
POST /api/admin/tenants/:id/activate       → { success, status:'ACTIVE' }
POST /api/admin/tenants/:id/plan  { plan } → { success, plan }
POST /api/admin/tenants/:id/impersonate    → { token, expiresIn }   (token curto do tenant)
```

## 6. Fluxo

- Front chama `GET /admin/me`; 200 → mostra menu/rota Admin; 403 → esconde.
- Admin opera na tabela; impersonar guarda o token do admin (`adimplo.admin_token`), ativa o
  token de impersonação e mostra banner "vendo como X — Sair" (restaura o token do admin).

## 7. Camadas afetadas

- [x] Config — `config/auth.config.ts` (platformAdminEmails, impersonationExpiresIn, isPlatformAdminEmail)
- [x] Middleware — `middlewares/require-admin.middleware.ts`
- [x] Repository — `admin.repository.ts` (global), `user.repository.ts` (findById/findOwnerByTenant), `platform-subscription.repository.ts` (+account.status)
- [x] Service — `admin.service.ts`, `auth.service.ts` (issueImpersonation), `platform-subscription.service.ts` (accountStatus)
- [x] Controller/Router — `admin.controller.ts`, `admin.router.ts`, `index.ts`
- [x] Domínio — `domain/plans.ts` (accountStatus no resolveEntitlements)
- [x] Schema/migration — AdminAuditLog
- [x] Front — admin.service, useAdmin, AdminPage, AdminRoute, SideBar (item), AppShell (banner), token.ts (swap)

## 8. Critérios de aceite

- [x] E-mail na allowlist acessa /admin; fora → 403 (API) e redirect (front).
- [x] Métricas retornam MRR + contagem por status + trials expirando.
- [x] Suspender bloqueia escrita do tenant (402), leitura segue; reativar reverte.
- [x] Mudar plano reflete em `GET /billing/plan` do tenant; auditoria gravada.
- [x] Impersonar emite token curto do tenant; banner "Sair" volta ao admin.
- [x] Build limpo; suíte verde (245 testes).

## 9. Riscos / considerações

- **Poder do admin**: allowlist por env (fácil revogar); impersonação curta + auditada. Endurecimentos
  futuros: 2FA para admin, painel de auditoria na UI, IP allowlist. Registrar como follow-up se escalar.
- Gating de suspensão é write-only (consistente com o plano). Bloqueio total é decisão de produto futura.

## 10. Notas de implementação

- `req.params.id` é `string|string[]` nos tipos do Express 5 → coerção `String(...)` no controller.
- Reuso: `domain/plans.ts` (PLANS/MRR/resolveEntitlements/nextPeriodEnd), padrão de query global
  (`findByGatewayId`), `Modal`/`STATUS_META` no front.
