# Spec 0035 — Radar de Risco (saúde do cliente / score)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-23
- **Relacionada**: 0033 (recuperação — consome/alimenta), 0016 (Elo/eventos),
  0017 (Cockpit), 0015 (recebimentos/pagamentos). Roadmap: `motor-protecao-receita.md` (**F2**).

## 1. Problema / Motivação

Hoje o sistema **age depois** que o dinheiro falha (recuperação, F1). Falta a camada
que **avisa antes**: qual cliente tem alta chance de **atrasar/dar calote** (avulso)
ou **cancelar** (recorrente). Sem esse sinal, o dono trata todo mundo igual e só
descobre o problema quando já perdeu. É a camada de **SINAL** do motor (antes da AÇÃO).

## 2. Objetivo

Dar a cada cliente um **score de saúde (0–100)** e uma **faixa** (`healthy` /
`watch` / `at_risk`), calculados por **regras** (v1, sem ML) a partir do **dinheiro**
(atraso crescente, recorrência perdida, casos perdidos) **+ comportamento** (abre o
link mas não paga — do Elo). Persistido para permitir tendência e **alimentar a Lista
do Dia (F3)** e deixar a recuperação (F1) proporcional ao risco.

**Fora de escopo (v1):** ML/predição estatística; score cross-tenant (é F9, travado
por LGPD — RN-F2-04); previsão de caixa (F4). v1 é heurística documentada e testável.

## 3. Regras de negócio

- **RN-3501** — Score **v1 por regras** transparentes e testáveis (não caixa-preta):
  parte de 100 e subtrai penalidades por sinal. `computeHealth(input, now)` é **função
  pura** (`src/domain/health-score.ts`).
- **RN-3502** — Sinais considerados (v1): atraso **médio** das últimas pagas;
  **tendência** de atraso (piorando); faturas **recorrentes vencidas não pagas**;
  faturas **em aberto já vencidas** (qtd + maior atraso atual); **hesitação** do Elo
  (`open > 0` e `pay_attempt = 0`); **casos de recuperação perdidos**.
- **RN-3503** — Faixas por limiar: `healthy` ≥ 70 · `watch` 40–69 · `at_risk` < 40.
- **RN-3504** — **Cliente sem histórico = neutro** (`healthy`, score 100): não penaliza
  quem acabou de entrar. `hasHistory=false` curto-circuita as penalidades.
- **RN-3505** — Recalcula (a) em **evento de pagamento** (webhook/baixa manual) para o
  cliente da fatura e (b) num **sweep diário** para todos (junto do cron do F1, 11:00).
- **RN-3506** — Funciona nos dois modos: recorrente = risco de **churn**; avulso =
  risco de **calote** na cobrança atual. (O mesmo score, lido conforme o contexto.)
- **RN-3507** — Score é **interno do tenant** (NÃO cruza empresas). Escopado por `tenantId`.
- **RN-3508** — `ClientHealth` é **1:1 com Client** (upsert idempotente por `clientId`).

## 4. Impacto no modelo de dados

Uma entidade nova (migration **aditiva idempotente**):

```prisma
model ClientHealth {
  id          String   @id @default(uuid())
  score       Int                       // 0..100
  band        String                    // healthy | watch | at_risk
  signals     Json                      // { avgDaysLate, trendUp, missedRecurring, openOverdue, maxDaysOverdue, opensNoPay, lostCases, hasHistory }
  computedAt  DateTime @default(now())
  clientId    String   @unique          // 1:1 com Client
  tenantId    String
  @@index([tenantId, band])
}
```
Sem alteração destrutiva. Back-relation `health ClientHealth?` em `Client`.

## 5. Contrato de API

```
# Sistema (cross-tenant, x-cron-secret) — recalcula todos
POST /api/system/health/run            → { processedTenants, updated }

# Tenant (JWT) — leitura (a UI mostra badge + filtro)
GET  /api/clients                       → cada cliente ganha { health?: { score, band } }
GET  /api/clients?band=at_risk          → filtra por faixa de risco
```
`cronAuth` no `/system/*`; `jwtAuth` nos demais.

## 6. Fluxo / Processamento

- **Recompute por evento (RN-3505a):** em `applyWebhook` (PAID) e na baixa manual,
  após fechar o caso (F1), dispara `HealthService.recomputeForClient(clientId)`.
- **Sweep diário (RN-3505b):** `POST /api/system/health/run` → por tenant
  (`runWithTenant`) → `recomputeAllForTenant()`. Pendurado no **mesmo cron das 11:00**,
  **depois** do sweep de recuperação (o desfecho `lost` do dia já conta no score).

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `ClientHealth` (+ back-relation em `Client`).
- [ ] Domínio — `src/domain/health-score.ts`: `computeHealth(input, now)` pura + testada.
- [ ] Repository — `client-health.repository.ts`: agrega histórico (faturas/pagas/vencidas),
  eventos Elo por cliente e casos perdidos; `upsert` do `ClientHealth`; leitura por tenant.
- [ ] Service — `health.service.ts`: `recomputeForClient`, `recomputeAllForTenant`, `runAllTenants`.
- [ ] Integração — chamar recompute no pagamento (webhook/baixa) e no cron (após F1).
- [ ] Controller/Router — `POST /api/system/health/run`; `GET /api/clients` inclui health + filtro `band`.
- [ ] Frontend — badge de saúde + coluna + filtro "Em risco" na lista de clientes.
- [ ] Testes — `computeHealth` (saudável / atenção crescente / em risco / sem histórico) + service.
- [ ] Contexto — `domain-model.md`, `motor-protecao-receita.md` (marcar F2).

## 8. Critérios de aceite

- [ ] Cliente sem histórico → `healthy`/neutro (não penaliza).
- [ ] Atraso crescente + parou de abrir → `at_risk`.
- [ ] Recalcula ao registrar um pagamento (evento) e no sweep diário.
- [ ] Filtro `?band=at_risk` retorna só os de risco. Suíte verde + build limpo.

## 9. Riscos / considerações

- **Base pequena no início:** com pouco histórico o score é fraco — por isso a regra
  neutra (RN-3504) e faixas conservadoras. Evolui com dados (e depois ML, se valer).
- **Custo do sweep:** agrega por tenant; v1 lê faturas do tenant com cap. Materializar/
  paginar só se a base crescer (follow-up em `tech-debt`).
- **Explicabilidade:** guardar `signals` no registro permite mostrar o **porquê** do
  score (alimenta o alerta da Lista do Dia, F3).

## 10. Notas de implementação

_(preencher durante/após: pesos escolhidos, o que ficou de fora, follow-ups.)_
