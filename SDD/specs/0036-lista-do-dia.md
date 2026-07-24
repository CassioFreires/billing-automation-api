# Spec 0036 — Lista do Dia (fila de ação priorizada)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-23
- **Relacionada**: 0017 (Cockpit), 0033 (recuperação/F1), 0035 (Radar/F2),
  0013 (notificações). Roadmap: `motor-protecao-receita.md` (**F3**).

## 1. Problema / Motivação

O Cockpit mostra **números** (a receber, em atraso, aging). Mas o dono não quer um
relatório — quer saber **o que fazer AGORA** para não perder dinheiro. Sem uma ordem
de prioridade, ele trata tudo igual e gasta energia no que rende pouco. Faltava a
tela que transforma dado em **decisão**: *"comece por aqui — é o que mais dói no bolso."*

## 2. Objetivo

Uma **Lista do Dia**: fila de itens **priorizados por dinheiro em risco**
(`valor × peso de risco`), unindo três fontes que já temos:
- **Vencidas** (F1/recuperação) — o núcleo do risco.
- **Saúde do cliente** (F2/Radar) — o peso: `at_risk` pesa mais que `healthy`.
- **Vencimentos próximos** — ação preventiva (cobrar antes de vencer).

Cada item traz **motivo** ("Vencida há 34 dias · cliente Em risco") e uma **ação de
1 clique** (Cobrar agora). Sem tabela nova (v1): é **agregação + ranking**.

**Fora de escopo (v1):** materializar a fila; "marcar como feito" persistente;
ações além de cobrar/navegar (pausa, acordo — vêm de F11); ordenação configurável.

## 3. Regras de negócio

- **RN-3601** — Fila **derivada** (sem tabela). Cada item aponta para uma fatura em
  aberto e é rankeado por `priority = valor × pesoRisco × severidade`.
- **RN-3602** — `pesoRisco` vem da faixa do Radar (F2): `at_risk`=1.0, `watch`=0.75,
  `healthy`/sem score=0.5. **Severidade** cresce com os dias de atraso (satura em ~60d).
- **RN-3603** — Tipos de item: **`recuperar`** (vencida COM caso de recuperação),
  **`cobrar`** (vencida SEM caso ainda), **`a_vencer`** (vence nos próximos 7 dias —
  peso preventivo menor). Vencimentos além de 7 dias **não** entram (não são ação de hoje).
- **RN-3604** — Ordenado por `priority` desc; limite v1 = **12** itens (o topo é o que
  importa). O que ficou de fora é sinalizado (contagem "e mais N").
- **RN-3605** — **Ação de 1 clique**: "Cobrar agora" enfileira a notificação da fatura
  (reusa `POST /api/notifications/trigger-overdue/:invoiceId`, spec 0013). Idempotente
  do ponto de vista do dono (reenfileirar é seguro).
- **RN-3606** — Somente leitura + escopo por tenant. O ranking é **função pura** testável.

## 4. Impacto no modelo de dados

**Nenhuma migração.** Combina `Invoice` (aberta) + `Client.health` (F2) +
`Invoice.recoveryCase` (F1). Materializar só se performance exigir (follow-up).

## 5. Contrato de API

```
GET /api/cockpit/actions        (JWT) → {
  geradoEm, total, mostrando,
  itens: [{ invoiceId, clientName, value, dueDate, kind, band, diasAtraso, motivo, priority }]
}
```
`jwtAuth`. A ação de cobrar reusa a rota de notificações existente.

## 6. Fluxo / Processamento

`GET /api/cockpit/actions` → `ActionQueueService.getForTenant(now)`:
1. Lê faturas em aberto do tenant com `client.health.band` e `recoveryCase.status`.
2. `rankDailyActions(candidatos, now)` (domínio puro): classifica, calcula
   `priority` e ordena; corta no top 12.
3. Devolve os itens + `total`/`mostrando`.

O front mostra no **Dashboard** ("Lista do Dia"), com **Cobrar agora** por item.

## 7. Camadas afetadas

- [ ] Domínio — `src/domain/action-queue.ts`: `rankDailyActions(candidatos, now, limit)` pura + testada.
- [ ] Repository — `CockpitRepository.findActionCandidates()` (aberta + health + caso).
- [ ] Service — `src/services/action-queue.service.ts`: `getForTenant(now)`.
- [ ] Controller/Router — `GET /api/cockpit/actions`.
- [ ] Frontend — bloco "Lista do Dia" no Dashboard + botão "Cobrar agora".
- [ ] Testes — ranking (ordena por dinheiro em risco; peso por faixa; severidade por atraso; corte no limite; a_vencer < vencida).
- [ ] Contexto — `domain-model.md`, `motor-protecao-receita.md` (marcar F3).

## 8. Critérios de aceite

- [ ] Itens ordenados por `priority` (dinheiro em risco) desc.
- [ ] Faixa `at_risk` sobe na fila vs `healthy` de mesmo valor.
- [ ] Vencida há mais tempo pesa mais que recém-vencida de mesmo valor.
- [ ] "Cobrar agora" enfileira a notificação da fatura.
- [ ] Vence >7 dias não aparece. Suíte verde + build limpo.

## 9. Notas de implementação

_(preencher: pesos usados, corte no top-N sinalizado, follow-ups — "marcar feito",
ações de retenção F11.)_
