# Spec 0051 — Modularização & Entitlements (venda por módulo)

- **Status**: Em revisão
- **Autor**: Cassio (via agente)
- **Data**: 2026-07-28
- **Dívida relacionada**: generaliza o gate único `reliefButton` (spec 0020)

## 1. Problema / Motivação

O Adimplo hoje sabe responder "o que o tenant PODE fazer?" por apenas dois mecanismos:
plano da plataforma (free/essencial/pro — controla escrita, quota e **um único** flag
`reliefButton`) e o `*Setting.enabled` de cada feature (o tenant liga/desliga **algo que
já possui**). Não existe camada dizendo **se o tenant tem direito** a um módulo.

Para vender o produto **por módulo** (ex.: "assine só o NFS-e"), precisamos de uma
camada de **titularidade** (entitlement) que seja:
- concedida **à la carte** por tenant (venda 1-a-1 no piloto assistido), com o plano
  apenas dando um default;
- **bloqueante de verdade** no backend (não dá para confiar só no front);
- superfície de **upsell** no front (módulo bloqueado aparece com cadeado + CTA).

## 2. Objetivo

Introduzir **módulos vendáveis** (Núcleo + 4 add-ons) e uma camada de entitlement por
tenant, ortogonal ao `*Setting.enabled`:

> **Entitlement** = "o tenant *tem* o módulo Fiscal?" (comercial, concedido por admin/plano)
> **`enabled`** = "o tenant *ligou* o Fiscal que ele tem?" (self-service, inalterado)

**Fora de escopo (v1):** cobrança automática por módulo (preço no catálogo é só p/ o
upsell exibir; a cobrança avulsa fica p/ F17/Fase de billing); self-checkout de módulo
(o tenant pede, o admin concede); gating por permissão de usuário (RBAC continua igual).

## 3. Regras de negócio

- **RN-M1** — Módulos: `Núcleo` (sempre disponível) + 4 add-ons vendáveis:
  `fiscal` (NFS-e), `access` (Liga/Desliga + IoT/Catracas), `growth` (Winback + Indique +
  Loja no Pagamento), `recovery` (Botão de Alívio + Retenção no cancelamento).
- **RN-M2** — Núcleo nunca é bloqueado: clientes, faturas, assinaturas, cobrança, régua,
  portal do pagador, recuperação de pagamento falho (F1), contrato no celular e white-label.
- **RN-M3** — Titularidade efetiva de um add-on = se existe linha em `ModuleEntitlement`
  para (tenant, módulo), vale `granted`; senão, vale o **default do plano** vigente
  (free/essencial: nenhum add-on; pro/trial: todos os 4).
- **RN-M4** — Só o **super-admin** concede/revoga módulos (`ModuleEntitlement`). O tenant
  vê o módulo bloqueado com upsell, mas não se auto-concede.
- **RN-M5** — Sem o módulo, qualquer chamada às rotas do add-on responde
  `402 { code: 'MODULE_NOT_ENABLED', module }`. A conta de serviço (cron/worker) e as
  rotas **públicas**/webhook do add-on **não** são bloqueadas (evita quebrar pagador e
  callback do provider).
- **RN-M6** — Migração **grandfather**: toda conta existente na aplicação da migration
  recebe `granted=true` nos 4 add-ons (ninguém que já usa perde acesso). Contas novas
  seguem o default do plano.
- **RN-M7** — O gate antigo do Botão de Alívio (`features.reliefButton`) passa a derivar
  do módulo `recovery` (compatível: pro/trial mantêm; a linha de entitlement pode liberar
  p/ planos menores).

## 4. Impacto no modelo de dados

- **Novo model `ModuleEntitlement`** (1:N por tenant; `@@unique([tenantId, moduleKey])`):
  `id`, `moduleKey` (String), `granted` (Boolean, default true), `tenantId`, timestamps.
- Relação nova em `Account`: `moduleEntitlements ModuleEntitlement[]`.
- Migration `20260818000000_modularizacao_entitlements`: cria tabela (idempotente) +
  **backfill grandfather** (INSERT dos 4 add-ons para todo `Account`, `ON CONFLICT DO NOTHING`).

## 5. Contrato de API

```
GET /api/auth/me   (JWT)  — agora inclui capacidades do tenant
Response 200 { id, name, email, role, tenantId, plan, modules: string[] }
  modules = add-ons efetivamente concedidos (subconjunto de fiscal|access|growth|recovery)

GET /api/admin/tenants/:id/modules   (token plataforma)
Response 200 { plan, modules: { key, label, granted, source: 'plan'|'grant' }[] }

PUT /api/admin/tenants/:id/modules   (token plataforma)
Request  { moduleKey: 'fiscal'|'access'|'growth'|'recovery', granted: boolean }
Response 200 { key, granted }   |  400 { error } (moduleKey inválido)
```

Rotas de add-on ganham o guard `requireModule(key)` (ver RN-M5). Sem o módulo → `402`.

## 6. Fluxo / Processamento

1. Admin abre o tenant no console → `GET /admin/tenants/:id/modules` mostra os 4 add-ons
   (com `source` plan/grant) → liga o módulo desejado (`PUT`).
2. Tenant faz login → `GET /auth/me` traz `modules` → o front libera as telas
   correspondentes; módulos não concedidos aparecem **bloqueados com upsell**.
3. Se o tenant (ou um cliente forjando request) chama uma rota de add-on sem o módulo, o
   `requireModule` responde `402 MODULE_NOT_ENABLED`.

## 7. Camadas afetadas

- [x] Domínio — `src/domain/modules.ts` (catálogo + `resolveModules`, puro)
- [x] Repository — `src/repositories/module-entitlement.repository.ts`
- [x] Service — `src/services/module-entitlement.service.ts`
- [x] Middleware — `src/middlewares/require-module.middleware.ts`
- [x] Controller/Router — `auth.controller` (me), `admin.controller`/`admin.router` (grant)
- [x] Schema Prisma / migration — `ModuleEntitlement` + backfill grandfather
- [x] Front — hook `useModules`/`ModuleGate`, upsell em Configurações, gating de coluna Nota
- [ ] Worker — n/a (conta de serviço isenta)

## 8. Critérios de aceite

- [ ] Dado um tenant SEM `fiscal`, quando chamar `POST /api/fiscal/settings`, então `402 MODULE_NOT_ENABLED`.
- [ ] Dado um tenant COM `fiscal`, quando chamar as rotas fiscais, então funciona normalmente.
- [ ] Dado o backfill, quando a migration roda, então toda conta existente tem os 4 add-ons.
- [ ] Dado `GET /auth/me`, então retorna `modules` coerente com plano + grants.
- [ ] Dado o admin `PUT .../modules {granted:false}`, então o tenant perde o add-on e vê upsell.
- [ ] `resolveModules` coberto por testes de domínio (plano default vs grant override).

## 9. Riscos / considerações

- **Não quebrar produção**: grandfather (RN-M6) é obrigatório; sem ele, tenants free que já
  usam add-ons perderiam acesso. Migration testada em local antes do deploy.
- Interceptor do front: `402 MODULE_NOT_ENABLED` **não** deve redirecionar p/ `/plano`
  (só `PLAN_EXPIRED` faz). Código distinto garante isso.
- Público/webhook isentos do gate (RN-M5) — do contrário, pagador e provider quebrariam.

## 10. Notas de implementação

- `entitlementsForCurrentTenant()` continua sendo o funil único do plano; o serviço de
  módulos compõe (plano → default) + (grants). `reliefButton` derivado de `recovery`.
- Preço no catálogo de módulos é informativo (upsell); cobrança avulsa é follow-up.
