# Spec 0009 — Cobrança recorrente (assinaturas / mensalidade)

- **Status**: Implementada (backend)
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: [0007-invoice-items](0007-invoice-items.md) (a fatura gerada tem 1 item), fluxo do agendador n8n (`SDD/context/fluxo-completo.md`)

## 1. Problema / Motivação

Hoje toda cobrança é **avulsa**: alguém precisa criar a fatura manualmente todo mês. O modelo de negócio mais comum (mensalidade, plano, assinatura) exige gerar a mesma cobrança de forma **recorrente**, sem trabalho manual e sem duplicar. Essa é a aposta de produto para reduzir retrabalho e aumentar retenção.

## 2. Objetivo

Um "molde" de cobrança (**Subscription**) por cliente que, a cada competência (mês), **gera uma Invoice** automaticamente — reaproveitando todo o fluxo existente (gateway → PIX/checkout → notificação → webhook).

- CRUD de assinaturas + pausar/retomar/cancelar (via `status`).
- `POST /api/subscriptions/run` — geração disparada pelo **agendador externo (n8n)**, no mesmo padrão do `trigger-overdue` (n8n loga por tenant e chama a rota).

**Fora de escopo:** proração, ciclos diferentes de mensal (semanal/anual), reajuste automático, tentativa de recobrança (dunning) — evoluções futuras.

## 3. Regras de negócio

- RN-R1: `dayOfMonth` é **1..28** (garantido no DTO) — evita meses sem os dias 29/30/31.
- RN-R2: `nextRunDate` guarda **quando** a próxima fatura deve ser gerada; é também o `dueDate` da fatura daquela competência.
- RN-R3: **Idempotência** — no máximo **1 fatura por assinatura por competência**. Garantida em dois níveis: checagem `findBySubscriptionPeriod` antes de chamar o gateway **e** índice único `@@unique([subscriptionId, period])` no banco.
- RN-R4: A geração processa **uma competência por execução** por assinatura (avança `nextRunDate` +1 mês). Como o n8n roda diariamente, atrasos são recuperados ao longo dos dias (sem backfill em massa numa única chamada).
- RN-R5: Só geram faturas assinaturas com `status = ACTIVE`. `PAUSED`/`CANCELED` são ignoradas pela varredura.
- RN-R6: A fatura gerada nasce com **um item** (`description` = descrição da assinatura, `quantity` 1, `unitPrice` = `amount`), passando pelo gateway como qualquer outra (RN-P2).
- RN-R7: Isolamento por tenant em todas as consultas (`requireTenantId()`). O `run` opera no **tenant do token** (n8n loga por tenant).
- RN-R8: Apagar a assinatura **não apaga** as faturas já geradas (FK `Invoice.subscriptionId` com `ON DELETE SET NULL`) — preserva histórico financeiro.

## 4. Impacto no modelo de dados

Novo modelo **`Subscription`** (id, description, amount, dayOfMonth, status, startDate, nextRunDate, createdAt, lastUpdate, clientId, tenantId). Na **`Invoice`**: novas colunas `subscriptionId?` + `period?` e índice único `[subscriptionId, period]` (NULLs distintos no Postgres → faturas avulsas não colidem). Migração aditiva e idempotente (`20260703120000_subscriptions`).

## 5. Contrato de API

```
POST /api/subscriptions                               (JWT)
Body: { clientId, description, amount, dayOfMonth?=10, startDate? }
Response: 201 { ...subscription }

GET  /api/subscriptions                               (JWT)  → lista do tenant
GET  /api/subscriptions/:id                           (JWT)  → 404 se não existe/outro tenant
PUT  /api/subscriptions/:id                           (JWT)  → { description?, amount?, dayOfMonth?, status? }
DELETE /api/subscriptions/:id                         (JWT)  → 204

POST /api/subscriptions/run                           (JWT)  → geração (n8n)
Response: 200 { processadas, geradas, ignoradas }
```

Ordem de rotas: `/run` (literal) **antes** de `/:id`.

Pausar/retomar/cancelar = `PUT /:id { status: "PAUSED" | "ACTIVE" | "CANCELED" }`.

## 6. Fluxo / Processamento

O n8n (que já é o "relógio" do sistema) chama `POST /api/subscriptions/run` diariamente:
1. `findDueActive(now)` — assinaturas `ACTIVE` do tenant com `nextRunDate <= agora`.
2. Para cada uma: `period = YYYY-MM(nextRunDate)`, `dueDate = nextRunDate`.
3. `InvoiceService.createForSubscription` — se já existe fatura para `[subscriptionId, period]`, ignora; senão cria a cobrança no gateway e persiste a Invoice (com item + vínculo).
4. Avança `nextRunDate` +1 mês.
5. Retorna `{ processadas, geradas, ignoradas }`.

A partir daí a fatura entra no fluxo normal: se o cliente ficar `EM_ATRASO`, o `trigger-overdue` a enfileira; o webhook a marca `PAID`.

## 7. Camadas afetadas

- [x] Schema/migration — `Subscription` + `Invoice.subscriptionId/period` + unique
- [x] DTO — `subscription.dto.ts` (create/update, dayOfMonth 1..28)
- [x] Util — `utils/recurrence.ts` (`periodOf`, `firstRunDate`, `nextMonth`)
- [x] Repository — `subscription.repository.ts` + `Invoice.findBySubscriptionPeriod` + `create` aceita subscriptionId/period
- [x] Service — `subscription.service.ts` (CRUD + `run`) + `Invoice.createForSubscription`
- [x] Controller/Router — `subscription.controller.ts`, `subscription.router.ts` (montado em `/subscriptions`)
- [x] Testes — service (create/run/idempotência), invoice (createForSubscription), DTO
- [ ] Frontend — página de assinaturas (próximo passo)

## 8. Critérios de aceite

- [x] Criar assinatura calcula `nextRunDate` no `dayOfMonth` (mês corrente se ainda não passou, senão o seguinte).
- [x] `run` gera 1 fatura por assinatura vencida, com item e vínculo, e avança o vencimento.
- [x] Rodar `run` duas vezes na mesma competência **não** duplica (ignoradas++).
- [x] Assinatura `PAUSED`/`CANCELED` não gera.
- [x] Apagar assinatura mantém as faturas geradas.
- [x] `dayOfMonth` fora de 1..28 e `amount<=0` → 400.

## 9. Riscos / considerações

- **Cross-tenant**: o `run` é por tenant (padrão n8n). Se um dia quisermos um cron único do sistema varrendo todos os tenants, dá para adicionar um job que itera contas — o núcleo (`createForSubscription`, idempotência) já suporta.
- **Backfill**: uma assinatura muito atrasada gera 1 mês por dia de execução do n8n. Para o caso de uso (mensalidade em dia) é o comportamento desejado; se precisar backfill imediato, trocar o `run` por um laço `while (nextRunDate <= now)`.
- **Gateway**: cada geração cria uma cobrança real no gateway. A checagem de idempotência ocorre **antes** do gateway para não gerar cobrança órfã.

## 10. Notas de implementação

Implementado em 2026-07-03 (backend). Datas em UTC no util para o `period`/vencimento serem estáveis independom do fuso do servidor. Frontend (página de assinaturas) é o passo seguinte.
