# Spec 0010 — Agendador de cobrança cross-tenant (billing scheduler)

- **Status**: Implementada (backend)
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: [0009-recurring-billing](0009-recurring-billing.md) (gera as faturas por tenant), `SDD/context/fluxo-completo.md`

## 1. Problema / Motivação

A spec 0009 gera faturas recorrentes **por tenant** (`POST /api/subscriptions/run`, escopo do JWT). Para um SaaS comercial com **muitos tenants**, disparar isso significaria **logar como cada empresa e chamar o endpoint** — 1 login + 1 chamada por tenant, todo dia. Não escala, é frágil e acopla o "relógio" à autenticação de cada cliente.

Precisamos de **um único disparo diário que cubra todos os tenants**, de forma assíncrona, resiliente e barata — reaproveitando a infra que já existe (RabbitMQ + worker + `runWithTenant`).

## 2. Objetivo

Um **agendador de sistema** que, num único disparo, enfileira a geração recorrente de **todos os tenants ativos**; o worker processa **um tenant por vez** em segundo plano.

- `POST /api/system/billing/run` — fan-out cross-tenant (auth por segredo de sistema).

**Fora de escopo:** UI para o agendador (é operação de infra); múltiplos ciclos (semanal/anual — herda da 0009); orquestração visual (n8n/EventBridge é escolha de deploy, não muda o app).

## 3. Regras de negócio

- RN-S1: O endpoint de sistema é autenticado por **segredo** (`x-cron-secret` = `CRON_SECRET`), **não** por JWT de tenant. É operação cross-tenant. Falha fechado sem o segredo (500) e rejeita segredo inválido (401), com comparação resistente a timing.
- RN-S2: `enqueueAllTenants` **não gera faturas** — só publica **1 job por tenant ativo** na fila `billing_scheduler_queue`. Responde `202` na hora (não bloqueia).
- RN-S3: O worker consome **1 tenant por vez** (`prefetch(1)`), roda a geração dentro de `runWithTenant(tenantId)` e delega para `SubscriptionService.run()` (0009). Idempotência por competência continua garantida lá.
- RN-S4: Erros no processamento de um tenant caem em **nack → retry limitado → DLQ** (mesma topologia quorum da fila de faturas). Um tenant com erro **não** derruba os demais.
- RN-S5: `AccountRepository.findActiveTenantIds` é a **única** query de sistema (sem filtro de tenant) — só pode ser alcançada pela rota protegida por `cronAuth`.

## 4. Impacto no modelo de dados

Nenhum. Usa `Account` (lista tenants ativos) e todo o modelo da 0009.

## 5. Contrato de API

```
POST /api/system/billing/run
Header: x-cron-secret: <CRON_SECRET>
Response: 202 { message, enfileirados: number }
          401 { error }  (segredo ausente/errado)
          500 { error }  (CRON_SECRET não configurado)
```

## 6. Fluxo / Processamento

```
[cron/EventBridge/n8n — 1 disparo/dia]
      │ POST /api/system/billing/run  (x-cron-secret)
      ▼
[BillingSchedulerService.enqueueAllTenants]
      │ AccountRepository.findActiveTenantIds()
      │ para cada tenant → publishRabbitMql(BILLING_QUEUE, { tenantId })
      ▼ responde 202 { enfileirados }
[RabbitMQ billing_scheduler_queue]  (quorum + DLX/DLQ + x-delivery-limit)
      ▼
[Worker initBillingWorker]  prefetch(1)
      │ processTenant(tenantId) = runWithTenant(tenantId, () => SubscriptionService.run())
      ▼ gera as faturas do tenant (idempotente por [subscriptionId, period])
```

**Por que escala:** 1 disparo → N tenants; o trabalho é distribuído na fila, com retry/DLQ; adicionar réplicas do worker processa tenants em paralelo (escala horizontal) sem tocar no gatilho nem no app.

## 7. Camadas afetadas

- [x] Repository — `AccountRepository.findActiveTenantIds` (query de sistema)
- [x] Fila — `billing-scheduler-queue.ts` (topologia quorum + DLX/DLQ)
- [x] Auth — `cronAuth` middleware + `CRON_SECRET` no `authConfig` + `requireCronSecret`
- [x] Service — `BillingSchedulerService` (`enqueueAllTenants` + `processTenant`)
- [x] Worker — `billing.worker.ts` (`initBillingWorker`); wiring em `server.ts` (inline) e `worker.ts`
- [x] Controller/Router — `system.controller.ts`, `system.router.ts` (montado em `/system`)
- [x] Disparo — `scripts/run-daily-billing.sh` (cron) + `CRON_SECRET` no `.env.example`
- [x] Testes — scheduler (fan-out, processTenant no contexto), cronAuth
- [ ] Docs — Postman + fluxo-completo (neste PR)

## 8. Critérios de aceite

- [x] `POST /system/billing/run` sem/errado segredo → 401; sem `CRON_SECRET` no ambiente → 500.
- [x] Com segredo correto → 202 `{ enfileirados: N }` = nº de tenants ativos.
- [x] Um job por tenant é publicado na fila com o `tenantId` no payload.
- [x] O worker gera as faturas de cada tenant no seu próprio contexto.
- [x] Rodar duas vezes no mesmo dia não duplica faturas (idempotência da 0009).
- [x] Erro num tenant vai para a DLQ e não afeta os outros.

## 9. Riscos / considerações

- **Segredo forte**: `CRON_SECRET` deve ser aleatório e longo (é a chave de uma operação cross-tenant). Nunca commitar; injetar por ambiente.
- **Escala do disparo**: o cron do host é o suficiente para começar. Ao crescer, trocar por AWS EventBridge/Scheduler apontando para o mesmo endpoint — **sem mudança no app** (gatilho desacoplado).
- **Muitos tenants**: o fan-out publica N mensagens rápido; o gargalo real (gerar faturas) fica no worker, que escala por réplicas. Se N for enorme, dá para paginar `findActiveTenantIds`.
- **Consumidor único**: com `RUN_WORKER_INLINE=true` a API consome as filas; com worker isolado, `RUN_WORKER_INLINE=false` evita consumidor duplicado (vale para as duas filas).

## 10. Notas de implementação

Implementado em 2026-07-03. O endpoint `POST /api/subscriptions/run` (0009) continua existindo para disparo **manual por tenant** (útil na UI/testes); o `/system/billing/run` é o disparo **automático cross-tenant**. Ambos convergem no mesmo `SubscriptionService.run()`.
