# Spec 0034 — Status efetivo da fatura ("vencida" é derivada da data)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-23
- **Relacionada**: 0017 (Cockpit — já calcula "em atraso" por data), 0033 (recuperação —
  sweep marca `OVERDUE`), 0016/0026 (Elo/régua).

## 1. Problema / Motivação

Ao criar uma fatura, ela **sempre nasce `PENDING`** (o repositório crava
`status: 'PENDING'`, sem olhar a data). O único mecanismo que faz `PENDING → OVERDUE`
é o **sweep de recuperação** (spec 0033), que roda **1x/dia**. Consequências:

- Uma fatura criada **já vencida** aparece como **"Pendente"** até o sweep rodar.
- Uma fatura que **vence hoje** só vira "Vencida" na próxima passada do cron.
- A tela **Faturas** (mostra o `status` cru) **discorda** do **Cockpit** (que já
  calcula "em atraso" **por data**) — duas fontes de verdade divergindo.

A raiz é conceitual: **"vencida" não é um estado que precisa ser gravado/mantido por
um job — é um fato que se deduz de `(dueDate, hoje, pago?)`.**

## 2. Objetivo

Tratar **"vencida" como status EFETIVO derivado**, calculado na leitura, como
**fonte única** reusada em todas as telas. O `status` persistido passa a refletir só
**eventos explícitos** (`PAID`/`FAILED`/`RENEGOTIATED`); o sweep (0033) continua
marcando `OVERDUE` no banco como **cache**, mas a UI **não depende** mais dele.

**Fora de escopo:** remover a coluna `status`/converter para enum nativo (D-07);
marcação eager na criação (desnecessária — o derive já resolve a exibição);
mudar o cadência do motor de recuperação (continua 1x/dia — é ação, não exibição).

## 3. Regras de negócio

- **RN-3401** — `statusEfetivo(fatura, agora)` = `OVERDUE` **se** `status === PENDING`
  **e** `dueDate < agora`; caso contrário, o próprio `status`. Função **pura**
  (`effectiveInvoiceStatus` em `src/domain/status.ts`).
- **RN-3402** — Vencimento **exatamente agora** ainda **não** é vencida (só depois de
  passar: comparação estrita `<`).
- **RN-3403** — Status terminais/explícitos (`PAID`/`FAILED`/`RENEGOTIATED`) e o
  `OVERDUE` já persistido são **preservados** (nunca "regridem" pelo derive).
- **RN-3404** — A API expõe `statusEfetivo` junto do `status` cru (lista + detalhe);
  o `status` continua no payload para **compatibilidade**.
- **RN-3405** — O **filtro** por status na lista fica **ciente da data**: `OVERDUE` =
  persistidas OU `PENDING` com `dueDate` passado; `PENDING` = `PENDING` com `dueDate`
  futuro. Assim o filtro **bate** com o selo.
- **RN-3406** — Separação de responsabilidades: **exibição** ("está vencida?") é
  derivada e instantânea; **ação** ("cobrar/recuperar agora?") é do motor 0033 (1x/dia).
  Uma fatura pode estar "vencida" na tela e só entrar em Recuperações na próxima
  passada do cron — e isso é correto.

## 4. Impacto no modelo de dados

**Nenhuma migração.** Sem coluna nova. `statusEfetivo` é **calculado**, não gravado.

## 5. Camadas afetadas

- [x] Domínio — `effectiveInvoiceStatus(status, dueDate, now)` (pura, testada).
- [x] Repository — `findAll` com filtro de status ciente da data (RN-3405).
- [x] Service — `listInvoices`/`getInvoiceById` anexam `statusEfetivo` (RN-3404).
- [x] Frontend — selo/label e filtro usam `statusEfetivo` (repo web).
- [x] Testes — domínio (passado/futuro/limite/terminais/inválido) + service.
- [x] Contexto — `domain-model.md` (OVERDUE efetivo).
- [ ] Produção — `UPDATE` seguro alinhando o `status` cru dos vencidos antigos
      (higiene; a UI já deriva). Sem enfileirar nada.

## 6. Critérios de aceite

- [x] `PENDING` com data passada → `statusEfetivo = OVERDUE` (sem job).
- [x] Fatura criada já vencida aparece "Vencido" **na hora** na tela Faturas.
- [x] Filtro "Vencidas" traz também as `PENDING` de data passada.
- [x] `PAID`/`FAILED` intactos. Suíte verde + build limpo.

## 7. Notas de implementação

_A verdade de "vencida" agora vive em UM lugar (`effectiveInvoiceStatus`). O sweep
(0033) segue como cache do `status` e dono da AÇÃO de recuperação. Follow-up possível:
derivar também nos relatórios/exports e, no futuro, dispensar a marcação persistida._
