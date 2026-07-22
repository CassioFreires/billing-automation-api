# Spec 0025 — Métrica "valor recuperado" (prova de ROI)

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0017 (Cockpit), spec 0015 (Recebimentos), spec 0018 (autonegociação)

## 1. Problema / Motivação

O maior argumento de venda do Adimplo é **recuperar dinheiro que ia ser perdido**. Mas o
Cockpit mostrava "recebido" (todo o caixa) sem destacar **quanto** disso era recuperação de
atraso. Sem esse número, o cliente não enxerga o ROI da ferramenta.

## 2. Objetivo

Exibir no Cockpit um indicador **"valor recuperado"** no período selecionado.

- **Em escopo:** cálculo no backend (Cockpit) + card destacado no dashboard.
- **Fora de escopo:** atribuição fina por canal (quanto veio do alívio × lembrete × régua) —
  fica para quando a régua (0026) e mais eventos existirem.

## 3. Regras de negócio

- **RN-2501** — "Valor recuperado" no período = soma dos **recebimentos** (`Payment`) com
  `paidAt >= since` **e** `paidAt > invoice.dueDate` — ou seja, pagamentos que entraram
  **após o vencimento** (inadimplência revertida). Definição honesta e computável.
- **RN-2502** — Usa a mesma janela do "recebido" (7/30/90 dias) do Cockpit.
- **RN-2503** — É um subconjunto do "recebido" (nunca maior). Em Decimal→number como as demais
  métricas (RN-CKP6).

## 4. Impacto no modelo de dados

Nenhum. Deriva de `Payment` (paidAt, amount) + `Invoice.dueDate`.

## 5. Contrato de API

`GET /api/cockpit/overview` ganha `kpis.recuperadoNoPeriodo: number` (mesmo endpoint, spec 0017).

## 6. Fluxo / Processamento

`CockpitRepository.sumRecoveredSince(since)` busca os pagamentos do período com a `dueDate` da
fatura e soma os que entraram após o vencimento (comparação entre colunas → em memória; volume
por tenant/período é baixo). `CockpitService.getOverview` inclui o número nos KPIs. O dashboard
mostra um card destacado com explicação.

## 7. Camadas afetadas

- [x] Repository — `CockpitRepository.sumRecoveredSince`
- [x] Service — `CockpitService.getOverview` (+`recuperadoNoPeriodo`)
- [x] Frontend — tipo `CockpitOverview` + card "Valor recuperado" no Dashboard

## 8. Critérios de aceite

- [ ] Pagamento com `paidAt > dueDate` entra no recuperado; pago em dia, não.
- [ ] O card reflete a janela 7/30/90 selecionada.
- [ ] Recuperado ≤ recebido sempre.

## 9. Riscos / considerações

- **Definição:** "pago após o vencimento" é aproximação de ROI (não distingue o gatilho). Quando
  houver régua/eventos ricos (0026), dá para refinar a atribuição.
- **Performance:** filtro em memória — ok no volume atual; se crescer muito, migrar para SQL
  (`paidAt > dueDate` via raw/relação).

## 10. Notas de implementação

- Teste do `CockpitService` cobre o novo KPI (mock retorna 240 → sai em `recuperadoNoPeriodo`).
  Suíte API mantida verde. Card com gradiente e explicação no Dashboard.
- Follow-up: atribuição por canal e série temporal (mini-gráfico) quando a régua existir.
