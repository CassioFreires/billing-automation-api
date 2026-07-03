# Spec 0013 — Disparo cross-tenant das notificações de vencidos

- **Status**: Implementada (backend)
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: [0010 agendador de cobrança], fluxo de notificações (`notication.service`, invoice worker)

## 1. Problema / Motivação

O `POST /api/notifications/trigger-overdue` é **por tenant** (JWT) e recebe as faturas prontas (o n8n as busca antes). Para um SaaS, faltava o **par** do agendador de cobrança (0010): um disparo diário que **enfileira as notificações dos vencidos de TODOS os tenants** sozinho.

## 2. Objetivo

`POST /api/system/notifications/run` (auth por segredo de sistema): varre os tenants ativos e, para cada um, enfileira as notificações dos vencidos na fila que o worker já consome (INVOICE_QUEUE).

## 3. Regras de negócio

- RN-N1: Auth por `x-cron-secret` (cross-tenant), igual ao `/system/billing/run`.
- RN-N2: Por tenant, "vencidos" = `PENDING` de clientes `EM_ATRASO` (mesma query do trigger-overdue: `findPendingInvoices`).
- RN-N3: Reaproveita a **fila e o worker existentes** — não cria fila nova. O envio (WhatsApp) segue assíncrono no invoice worker.
- RN-N4: Implementação **inline** (queries + publish são leves; o trabalho pesado já é assíncrono). Se escalar para milhares de tenants, dá para fan-out numa fila (como 0010).
- RN-N5: Isolamento por tenant via `runWithTenant` em cada iteração.

## 4. Impacto no modelo de dados

Nenhum.

## 5. Contrato de API

```
POST /api/system/notifications/run
Header: x-cron-secret: <CRON_SECRET>
Response: 202 { message, tenants, comVencidos, enfileirados }
```

## 6. Fluxo

```
[cron diário] → POST /system/notifications/run (x-cron-secret)
   → NotificationSchedulerService.runAllTenants()
       para cada tenant ativo → runWithTenant →
           findPendingInvoices (vencidos) → queueOverdueInvoices → INVOICE_QUEUE
   → 202 { tenants, comVencidos, enfileirados }
[invoice worker] consome INVOICE_QUEUE → envia WhatsApp (log/cloud)
```

O `scripts/run-daily-billing.sh` agora dispara os **dois** endpoints (cobrança + notificações) no mesmo horário.

## 7. Camadas afetadas

- [x] Service — `NotificationSchedulerService.runAllTenants`
- [x] Controller/Router — `SystemController.runNotifications`, `POST /system/notifications/run`
- [x] Script de cron — dispara billing/run + notifications/run
- [x] Testes — agrega totais; não enfileira quando não há vencidos
- [x] Reuso — AccountRepository, InvoiceRepository, NotificationService, INVOICE_QUEUE

## 8. Critérios de aceite

- [x] `POST /system/notifications/run` com segredo válido → 202 com totais.
- [x] Enfileira apenas tenants com vencidos; agrega `enfileirados`.
- [x] Segredo ausente/errado → 401 (cronAuth).
- [x] Reusa o worker de faturas (sem fila nova).

## 9. Riscos / considerações

- **Escala**: inline atende bem o início. Com muitos tenants, migrar para fan-out em fila (espelho da 0010).
- **Envio real**: hoje o worker está em `log` (não envia). O envio de verdade depende do WhatsApp por tenant (#6) e da verificação Meta.

## 10. Notas

Implementado em 2026-07-03. Fecha a automação diária: **gera** as mensalidades (0010) e **cobra** os vencidos (0013), tudo cross-tenant, num disparo só do cron.
