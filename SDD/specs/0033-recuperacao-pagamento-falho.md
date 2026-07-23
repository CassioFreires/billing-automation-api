# Spec 0033 — Recuperação de pagamento falho (Guardião da Receita)

- **Status**: Em revisão
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-23
- **Relacionada**: 0018 (autonegociação/Botão de Alívio), 0026 (régua multipasso),
  0016 (Elo/eventos), 0032 (canais), 0010/0013 (agendador cross-tenant).
  Roadmap: `SDD/motor-protecao-receita.md` (F1).

## 1. Problema / Motivação

Hoje, quando uma cobrança **vence sem pagar** (ou uma cobrança recorrente falha), o
sistema dispara lembrete(s) pela régua e **desiste** — não há um dono do "vou
recuperar esse dinheiro até o fim". O maior vazamento de um negócio recorrente é o
**churn involuntário**: a assinatura morre porque um pagamento falhou e ninguém
seguiu adiante. Falta uma camada que **persiga a recuperação com escalonamento** e
termine em um **desfecho explícito** (recuperado ou perdido), com o dono sabendo.

## 2. Objetivo

Introduzir o **caso de recuperação** (`RecoveryCase`): quando uma fatura vira
`OVERDUE`, abre-se um caso que roda uma **sequência adaptativa** (lembrar → trocar de
canal → ofertar alívio) até **recuperar** (pagamento/acordo) ou **encerrar como
perdido**. Vale para **avulso** e **recorrente**.

**Fora de escopo (v1):** score/radar de risco (F2, spec futura); winback de quem já
saiu (F5); pagamento parcial; retry de PIX Automático (F6); sequência de recuperação
100% configurável por tenant (v1 usa sequência-padrão + reusa `NegotiationSetting`
para o passo de alívio). Bloqueio de acesso (F12) é consumidor futuro do desfecho.

## 3. Regras de negócio

- **RN-3301** — Ao uma fatura entrar em `OVERDUE`, abre-se **um** `RecoveryCase`
  (idempotente: um caso aberto por fatura). `amountAtRisk = Invoice.value`.
- **RN-3302** — A recuperação é o **dono** da comunicação da fatura enquanto o caso
  está aberto (evita conflito/duplo envio com a régua 0026, que cuida do
  pré-vencimento/lembrete gentil). Ver §9.
- **RN-3303** — A cada ciclo do sweep, o caso avança **no máximo um passo** cujo
  `nextActionAt <= hoje` (idempotente por passo/dia, padrão do agendador 0010/0026).
- **RN-3304** — O passo é **adaptativo**: se o Elo indicar hesitação
  (`open >= NegotiationSetting.hesitationOpens` **e** nenhum `pay_attempt`), o passo
  vira `offer_relief` e dispara o fluxo de acordo (spec 0018) quando o alívio está
  habilitado; senão, `remind`.
- **RN-3305** — Se o envio de um passo **falhar** no canal atual, o próximo passo usa
  **outro canal** (`resolveChannels`, 0032) antes de escalar.
- **RN-3306** — O caso **fecha como `recovered`** quando: (a) o webhook confirma
  `PAID` (RN-P3, idempotente) **ou** (b) um `Agreement` é aceito (supersede, 0018).
  `outcome = paid | agreement`.
- **RN-3307** — Esgotados os passos sem sucesso, o caso vira `lost`
  (`outcome = sem_resposta`). O dono é notificado / aparece no painel.
- **RN-3308** — O dono pode **encerrar manualmente** um caso (`outcome = cancelado_pelo_dono`).
- **RN-3309** — Tudo é **escopado por `tenantId`** (multi-tenancy, 0001). Cada ação
  registra um `RecoveryAttempt`.

## 4. Impacto no modelo de dados

Duas entidades novas (migration **aditiva idempotente**, ex.:
`20260805000000_recuperacao_pagamento`):

```prisma
model RecoveryCase {
  id             String    @id @default(uuid())
  reason         String    @default("overdue") // overdue | payment_failed | pix_unpaid | card_expired
  status         String    @default("open")    // open | recovering | recovered | lost | cancelled
  amountAtRisk   Decimal   @db.Decimal(12,2)
  currentStep    Int       @default(0)
  nextActionAt   DateTime?
  openedAt       DateTime  @default(now())
  resolvedAt     DateTime?
  outcome        String?   // paid | agreement | sem_resposta | cancelado_pelo_dono
  lastUpdate     DateTime  @updatedAt
  invoiceId      String    @unique
  clientId       String
  subscriptionId String?
  tenantId       String
  attempts       RecoveryAttempt[]
  @@index([tenantId, status, nextActionAt])
}

model RecoveryAttempt {
  id         String   @id @default(uuid())
  step       Int
  channel    String?  // whatsapp | email
  action     String   // remind | switch_channel | offer_relief
  result     String?  // sent | failed | opened | paid
  occurredAt DateTime @default(now())
  caseId     String
  tenantId   String
  case       RecoveryCase @relation(fields: [caseId], references: [id])
  @@index([tenantId, caseId])
}
```
Sem alteração destrutiva em tabelas existentes. Estados da fatura inalterados
(o caso "orbita" a fatura).

## 5. Contrato de API

```
# Sistema (cross-tenant, x-cron-secret) — avança os casos devidos
POST /api/system/recovery/run          → { processedTenants, advanced, closed }

# Tenant (JWT)
GET  /api/recovery/cases               → [{ id, invoiceId, clientName, amountAtRisk, status, currentStep, nextActionAt }]
GET  /api/recovery/cases/:id           → { ...caso..., attempts: [...] }
POST /api/recovery/cases/:id/close     → { id, status:"cancelled", outcome:"cancelado_pelo_dono" }
```
Validação Zod nos DTOs; `cronAuth` no `/system/*`, `jwtAuth` nos demais.

## 6. Fluxo / Processamento

**Abertura** (RN-3301): no ponto em que a fatura passa a `OVERDUE` (marcação de
vencidos), `RecoveryService.openCaseIfNeeded(invoice)` cria o caso (`nextActionAt = hoje`).

**Sweep diário** (novo, cron 11:05, depois do billing 11:00):
```
cron → POST /api/system/recovery/run (x-cron-secret)
  → RecoveryScheduler: lista tenants ativos → 1 job por tenant (reusa billing_scheduler_queue OU inline)
  → por tenant (runWithTenant):
       para cada RecoveryCase open/recovering com nextActionAt <= hoje:
         decideNextStep(case, eloSignals, settings)  // domínio puro
           ├─ remind        → envia pelo canal (resolveChannels 0032) + evento sent
           ├─ switch_channel→ troca canal e reenvia
           └─ offer_relief  → dispara Agreement (0018)
         grava RecoveryAttempt; currentStep++; reprograma nextActionAt
         se passos esgotados → status=lost, outcome=sem_resposta
```

**Fechamento** (RN-3306): em `InvoiceService.applyWebhook` (PAID) e no aceite de
`Agreement`, chamar `RecoveryService.closeCase(invoiceId, outcome)` — idempotente.

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `RecoveryCase`, `RecoveryAttempt`
- [ ] Domínio — `src/domain/recovery.ts`: `decideNextStep(...)` (função pura, testada)
- [ ] DTO — `src/dtos/recovery.dto.ts` (Zod: filtros de listagem, close)
- [ ] Repository — `src/repositories/recovery-case.repository.ts` (abrir, buscar devidos, avançar, fechar; escopo por tenant)
- [ ] Service — `src/services/recovery.service.ts` (`openCaseIfNeeded`, `advanceDueCases`, `closeCase`)
- [ ] Integração — ligar em: marcação de `OVERDUE` (abre) e `applyWebhook`/aceite de `Agreement` (fecha)
- [ ] Controller/Router — `recovery.controller.ts` + `recovery.router.ts` (`/api/recovery/*`) e rota de sistema `/api/system/recovery/run`
- [ ] Worker/Scheduler — `RecoverySchedulerService` (fan-out) + consumo (reusa padrão de `billing.worker`)
- [ ] Frontend — aba "Recuperações" (lista + timeline por caso + encerrar) e card no Cockpit
- [ ] Testes — `decideNextStep` (remind/switch/relief/esgotado) + service (abrir/fechar idempotente) com repo mockado
- [ ] Contexto — atualizar `fluxo-completo.md`, `overview.md`, `domain-model.md`

## 8. Critérios de aceite

- [ ] Fatura que vira `OVERDUE` abre **um** caso (rodar de novo não duplica).
- [ ] O sweep avança **um passo por dia** por caso (idempotente).
- [ ] Hesitação no Elo (`open>=limiar`, sem `pay_attempt`) leva ao passo `offer_relief` (Agreement criado) quando o alívio está ligado.
- [ ] Falha de envio num canal → próximo passo em outro canal.
- [ ] Webhook `PAID` fecha o caso como `recovered/paid` (idempotente).
- [ ] Passos esgotados → `lost/sem_resposta`, visível no painel.
- [ ] Encerrar manual → `cancelled`.
- [ ] Suíte verde + build limpo.

## 9. Riscos / considerações

- **Conflito com a régua (0026):** definir claramente a fronteira — régua =
  lembretes programados (inclui pré-vencimento); recuperação = orquestração
  pós-vencimento com desfecho. Enquanto um caso está aberto, ele é a autoridade da
  comunicação da fatura para **não haver duplo envio**. Validar com um teste de
  integração.
- **Idempotência:** abertura (por fatura) e fechamento (por webhook) precisam ser
  idempotentes — gateways reenviam eventos.
- **Custo de envio:** cada passo pode custar (WhatsApp). Respeitar limites (PR-11) e
  não reenviar no mesmo dia.
- **v1 com sequência-padrão:** sequência por tenant configurável fica como follow-up.

## 10. Notas de implementação

_(preencher durante/após a implementação: decisões, o que ficou de fora, follow-ups
em `tech-debt.md` — ex.: pagamento parcial, retry de PIX Auto, sequência configurável.)_
</content>
