# Spec 0017 — Cockpit do dono (inteligência de recebíveis)

- **Status**: Aprovada
- **Autor**: Cassio
- **Data**: 2026-07-20
- **Relacionada**: `visao-produto.md` (Módulo **M4**); usa M1 (`Payment`, spec 0015) e a Fundação Elo (`InteractionEvent`, spec 0016)

## 1. Problema / Motivação

Hoje o dono vê uma **lista de faturas**, não o **raio-x do caixa**. Falta a tela que
ele abre todo dia: quanto tem a receber, quanto já entrou, quanto está vencido, o que
vence essa semana e **quem está enrolando** (abriu o link e não pagou — dado do Elo).
É o "uau" que retém e justifica a assinatura.

## 2. Objetivo

Endpoints de **agregação** (somente leitura) que alimentam um painel:
KPIs de caixa, aging (envelhecimento da inadimplência) e uma **fila de ações do dia**
(vence essa semana + hesitando, do Elo).

**v1 (esta spec):** um endpoint composto `GET /api/cockpit/overview` que devolve tudo
que o painel precisa em uma chamada. Cálculos puros e testáveis.

**Fora de escopo (futuro):** DSO real, previsão de caixa por padrão de pagamento,
score de risco por cliente (evolui com os eventos acumulados), cache do painel.

## 3. Regras de negócio

- **RN-CKP1**: Tudo é **escopado por tenant** (`requireTenantId`) e **somente leitura**
  (nenhuma escrita).
- **RN-CKP2**: "A receber" = faturas **não pagas** (`PENDING` + `OVERDUE`). "Em atraso" =
  não pagas com `dueDate < hoje` (calculado por **data**, não confiando só no status).
  "A vencer" = não pagas com `dueDate >= hoje`.
- **RN-CKP3**: **Aging** por dias de atraso (a partir de `dueDate`): `a_vencer`,
  `d0_30`, `d31_60`, `d60_mais` — somando **valor**.
- **RN-CKP4**: "Recebido no período" = soma de `Payment.amount` com `paidAt` nos últimos
  `days` dias (default 30) — usa a fonte única de recebimentos (M1).
- **RN-CKP5**: **Hesitando** (do Elo) = faturas **não pagas** com `open >= N`
  (`DEFAULT_HESITATION_OPENS`) e **sem** `paid` — é a fila de "cobre/ofereça alívio".
- **RN-CKP6**: Dinheiro é `Decimal` no banco; as métricas saem como `number` (contrato
  da API — RN-I5). Divisões (taxa) protegidas contra divisão por zero.

## 4. Impacto no modelo de dados

**Nenhuma entidade nova.** É um **read model** sobre `Invoice`, `Payment` e
`InteractionEvent`. Índices já existentes cobrem as consultas
(`@@index([tenantId, status])`, `@@index([tenantId, paidAt])` no Payment,
`@@index([invoiceId, type])` no InteractionEvent).

## 5. Contrato de API

```
GET /api/cockpit/overview?days=30                    (JWT)
Response: 200 {
  periodoDias: number,
  kpis: {
    aReceber: number, aVencer: number, emAtraso: number,
    taxaInadimplencia: number,        // 0..1 (emAtraso / aReceber)
    recebidoNoPeriodo: number
  },
  porStatus: { PENDING: n, PAID: n, OVERDUE: n, FAILED: n },
  aging: { aVencer: number, d0a30: number, d31a60: number, d60mais: number },
  acoes: {
    vencemEssaSemana: [ { invoiceId, clientName, value, dueDate } ],
    hesitando:        [ { invoiceId, clientName, value, opens } ]   // do Elo
  }
}
```

## 6. Fluxo / Processamento

```
GET /api/cockpit/overview
  → CockpitController.overview (valida days: int 1..365, default 30)
  → CockpitService.getOverview(days)
       → repo.findOpenInvoices()      // não pagas (id, value, dueDate, clientName)
       → repo.sumReceivedSince(date)  // aggregate Payment.amount
       → repo.countByStatus()         // groupBy status
       → repo.findHesitating(N)       // invoices open>=N, sem paid, não pagas
       → domain/cockpit.ts: summarizeOpenInvoices()/buildAging()/dueThisWeek() (PURO)
```

Os cálculos (KPIs, aging, vence-essa-semana) são **funções puras** em
`src/domain/cockpit.ts` a partir da lista de faturas abertas — testáveis sem banco.

## 7. Camadas afetadas

- [ ] Domínio — `src/domain/cockpit.ts` (puro: aging, KPIs, dueThisWeek)
- [ ] Repository — `src/repositories/cockpit.repository.ts` (findOpenInvoices, sumReceivedSince, countByStatus, findHesitating)
- [ ] Service — `src/services/cockpit.service.ts` (orquestra + compõe)
- [ ] Controller — `src/controllers/cockpit.controller.ts`
- [ ] Router — `src/routers/cockpit.router.ts` + montar `/cockpit` (JWT) em `src/index.ts`
- [ ] Testes — `cockpit.domain` (aging/KPIs puros) + `cockpit.service` (composição, repo mockado)
- [ ] Docs — `overview.md` (capacidade), `visao-produto.md` (M4 → em andamento)

## 8. Critérios de aceite

- [ ] `GET /api/cockpit/overview` devolve KPIs, porStatus, aging e ações, escopado por tenant.
- [ ] `aReceber` = soma de PENDING+OVERDUE; `emAtraso` conta faturas com `dueDate<hoje`.
- [ ] `taxaInadimplencia` = 0 quando `aReceber` = 0 (sem divisão por zero).
- [ ] `aging` soma corretamente nos 4 baldes por dias de atraso.
- [ ] `recebidoNoPeriodo` soma `Payment.amount` dos últimos `days` dias.
- [ ] `hesitando` lista faturas não pagas com `open>=N` e sem `paid` (dado do Elo).
- [ ] `days` inválido (não-int, <1, >365) → 400.
- [ ] Valores monetários saem como `number`.

## 9. Riscos / considerações

- **Escala**: `findOpenInvoices` traz as faturas abertas para calcular em memória —
  simples e testável, ok para tenants pequenos (free-tier). Follow-up: mover aging/KPIs
  para agregação SQL quando o volume exigir (registrar em `tech-debt`).
- **Status vs data**: `OVERDUE` pode não estar setado em todas; por isso "em atraso" é
  calculado por `dueDate` (RN-CKP2), não só pelo status.
- **Cache**: sem cache em v1; se pesar, reusar o Redis (como em `findPendingInvoices`).

## 10. Notas de implementação

Implementado (backend) em 2026-07-20.

- **Domínio puro** `src/domain/cockpit.ts`: `agingBucket`, `summarizeOpenInvoices`,
  `inadimplenciaRate` (guarda div/0), `dueWithinDays`, `round2` — testado
  (`cockpit.domain.test.ts`).
- **Repositório** `src/repositories/cockpit.repository.ts`: `findOpenInvoices`,
  `sumReceivedSince` (aggregate), `countByStatus` (groupBy), `findHesitating`
  (groupBy `open` com `having >= N` + filtro de status em aberto = "sem paid").
- **Service** `src/services/cockpit.service.ts` (`getOverview(days, now?)`, `now`
  injetável para teste; uma leitura das abertas alimenta KPIs/aging/ações) +
  controller/router (`/cockpit/overview`, JWT, `days` 1..365).
- **Testes**: `cockpit.domain` + `cockpit.service` (repo mockado, `now` fixo) —
  **168 testes verdes**; build limpo.
- **Follow-ups (tech-debt / evolução)**: agregação SQL do aging quando escalar;
  DSO real; score de risco por cliente; **loop M4→M2** (a previsão retroalimenta a
  régua); cache Redis do painel.
