# Spec 0031 — Console de Plataforma (identidade + acesso + UI separados)

- **Status**: Implementada
- **Autor**: time Adimplo
- **Data**: 2026-07-21
- **Relacionada**: **supersede a autorização** da spec 0023 (allowlist de e-mail + admin-como-tenant). Reaproveita o resto da 0023 (métricas, tabela de tenants, suspender, mudar plano, impersonar, auditoria).

## 1. Problema / Motivação

A 0023 identificava o super-admin por allowlist de e-mail, mas ele **logava como um tenant**
(auto-cadastro criava uma clínica vazia) e o painel era uma **aba no app do cliente**. Resultado:
identidade/UX "emboladas" entre o dono do SaaS (desenvolvedor) e o dono da clínica; em prod
sobraram contas-lixo `teste`/`Teste`. Precisamos de separação real.

## 2. Objetivo

Console da plataforma **totalmente separado** do app dos clientes: identidade própria
(`PlatformAdmin`), login próprio, **token de escopo próprio** e **UI própria** (`/console`).
Nenhum tenant vê ou acessa o console; nenhum admin é tenant.

**Fora de escopo:** gestão de admins pela UI (só bootstrap por script); subdomínio (fica em `/console`);
papéis internos ao tenant (spec 0030).

## 3. Regras de negócio (segurança)

- **RN-C1**: `PlatformAdmin` (email @unique, passwordHash bcrypt, role) é uma tabela SEPARADA —
  sem tenantId/clínica/trial.
- **RN-C2**: login em `POST /admin/auth/login` emite JWT `{ sub, scope:'platform', role }` **sem
  tenantId**.
- **RN-C3**: `requirePlatformAdmin` aceita SÓ `scope:'platform'` + `PlatformAdmin` existente; token
  de tenant (sem scope) → **403**. `jwtAuth` (tenant) rejeita token sem tenantId → token de plataforma
  não acessa rotas de tenant. **Isolamento bidirecional.**
- **RN-C4**: 1º admin criado por **script** (`npm run create-admin`, bcrypt, lê env). Sem auto-cadastro.
- **RN-C5**: impersonação emite JWT de **tenant** (`scope:'tenant'`, tenantId alvo, `imp:<adminEmail>`,
  curto) + auditoria (`AdminAuditLog`).
- **RN-C6**: front usa DUAS sessões independentes — `adimplo.token` (tenant) e `adimplo.console_token`
  (console) — instâncias axios separadas.

## 4. Impacto no modelo de dados

- `PlatformAdmin` (novo) — migration `20260725000000_platform_admin` (aditiva/idempotente).
- `AdminAuditLog` (0023) mantido. `Account.status` segue no gating (0020/0023).

## 5. Contrato de API

```
POST /api/admin/auth/login  { email, password }  → { token, expiresIn, admin } | 401
GET  /api/admin/me            → { isPlatformAdmin, email, name, role }
GET  /api/admin/metrics, /tenants, /tenants/:id
POST /api/admin/tenants/:id/{suspend,activate,plan,impersonate}
```
Todas (exceto login) sob `requirePlatformAdmin` (scope platform).

## 6. Fluxo

- Console: `/console/login` → token de plataforma (guardado em `console_token`) → `/console`
  (layout próprio, sem sidebar de tenant) com métricas + tabela + ações.
- Impersonar: gera token de tenant → grava `adimplo.token` + flag → abre o app do cliente com
  banner "vendo como X — Sair" (limpa e volta a `/console`; a sessão do console permanece).

## 7. Camadas afetadas

- [x] Schema/migration — `PlatformAdmin`
- [x] Config — `auth.config` (bootstrap env; removida allowlist)
- [x] Repo/Service — `platform-admin.repository.ts`, `platform-admin.service.ts`; `auth.service` (scope tenant na impersonação)
- [x] Middleware — `require-admin.middleware.ts` (scope + PlatformAdmin)
- [x] Controller/Router — `admin.controller` (+login, me via req.admin), `admin.router` (+/auth/login público)
- [x] Script — `scripts/create-admin.mjs` + `package.json`
- [x] Front — `consoleApi`, `console-auth.service`, `ConsoleAuthContext`, `ConsoleRoute`, `pages/Console/*`,
      `App.tsx` (árvore /console; removido /admin do tenant), `SideBar` (sem aba Admin), `AppShell` (banner → /console), `lib/token` (2 sessões)

## 8. Critérios de aceite

- [x] `create-admin` cria o PlatformAdmin; login no console emite token scope platform (sem tenantId).
- [x] Token de tenant em `/admin/*` → 403; token de plataforma em rota de tenant → rejeitado.
- [x] App do cliente NÃO tem aba/rota Admin; console vive em `/console` com login/layout próprios.
- [x] Suspender/mudar plano/impersonar seguem funcionando via console (0023).
- [x] Build limpo; suíte verde (251 testes).

## 9. Riscos / considerações

- Bootstrap por env: proteger as variáveis; trocar a senha após 1º acesso (futuro: troca de senha no
  console). Endurecimentos futuros: 2FA, subdomínio dedicado, gestão de múltiplos admins pela UI.
- Limpeza em produção: remover os tenants `teste`/`Teste` criados pela abordagem anterior.

## 10. Notas de implementação

- `admin.service`/`admin.repository`/`AdminAuditLog` da 0023 reaproveitados sem mudança; só a
  AUTENTICAÇÃO e a SUPERFÍCIE de UI mudaram.
- Duas instâncias axios no front (`api` tenant, `consoleApi` plataforma) evitam colisão de sessão.
