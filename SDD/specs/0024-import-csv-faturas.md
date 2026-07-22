# Spec 0024 — Importação de faturas por CSV (em lote)

- **Status**: Implementada (código)
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0008 (import de clientes — já existe), spec 0007 (cobranças)

## 1. Problema / Motivação

Quem chega ao Adimplo com uma carteira já formada precisa lançar dezenas de cobranças de
uma vez. O import de **clientes** por CSV já existe (spec 0008); falta o de **faturas** —
sem ele, o onboarding (0021) de quem tem volume trava no passo "emitir cobranças".

## 2. Objetivo

Permitir **criar faturas em lote** a partir de um CSV, resolvendo o cliente pelo telefone.

- **Em escopo:** endpoint `POST /api/invoices/import`; assistente de CSV no front (upload,
  mapa de colunas, prévia, resultado); reuso do fluxo de criação (gera link/PIX via gateway,
  hoje mock) e do `csv.ts` do front.
- **Fora de escopo:** atualizar faturas existentes (import é só criação); agendamento; import
  de recebimentos.

## 3. Regras de negócio

- **RN-2401** — Cada linha vira **uma fatura nova**. Não há dedup (uma pessoa pode ter várias).
- **RN-2402** — O cliente é resolvido pelo **telefone** (`tenantId+phone`). Telefone que não
  existe no tenant → a linha é **ignorada** e reportada em `erros` (não cria cliente aqui;
  para isso, importe clientes antes — spec 0008).
- **RN-2403** — Cada fatura criada passa pelo **mesmo fluxo** de criação individual (reserva →
  cobra no gateway → anexa link/PIX → registra `link_created`). Erro em uma linha **não aborta**
  as demais (best-effort por linha).
- **RN-2404** — Máximo de **200 faturas por importação** (proteção de carga).
- **RN-2405** — Exige plano com escrita (gating `requireWriteAccess`). A quota por plano
  (spec 0020) **não** é aplicada por linha nesta versão — ver follow-up.

## 4. Impacto no modelo de dados

Nenhum. Reusa `Invoice`/`InvoiceItem` e o `Client` existentes.

## 5. Contrato de API

```
POST /api/invoices/import          (JWT + requireWriteAccess)
Request: { invoices: [ { clientPhone, value, dueDate, description? } ] }   (1..200)
Response: 200 {
  criados: number,
  ignorados: number,
  erros: [ { linha: number, clientPhone: string, motivo: string } ]
}
```

Validação Zod (`importInvoices.dto.ts`): `value > 0`, `dueDate` data válida, `clientPhone` ≥ 10.

## 6. Fluxo / Processamento

1. Controller valida o DTO e chama `InvoiceService.importInvoices(rows)`.
2. Service resolve **em uma query** os `clientId` por telefone (`ClientRepository.findByPhones`).
3. Para cada linha: telefone conhecido → `createPayment({clientId, value, dueDate, items:[…]})`;
   desconhecido ou erro → registra em `erros`. Conta `criados`/`ignorados`.
4. Front: `ImportInvoicesWizard` — parse CSV (`csv.ts`), mapeia colunas, mostra prévia, envia,
   exibe o resumo (criados / ignorados / erros).

## 7. Camadas afetadas

- [x] DTO — `src/dtos/importInvoices.dto.ts`
- [x] Util — `src/utils/import-invoice-plan.ts` (dedup? não; split conhecido/desconhecido — puro)
- [x] Repository — `ClientRepository.findByPhones`
- [x] Service — `InvoiceService.importInvoices`
- [x] Controller/Router — `invoice.controller.import` + `POST /invoices/import`
- [x] Frontend — `ImportInvoicesWizard` + botão em Faturas + `invoices.service.import`

## 8. Critérios de aceite

- [ ] CSV com telefones existentes cria N faturas PENDING com link/PIX; retorna `criados=N`.
- [ ] Linha com telefone inexistente entra em `erros` e não derruba o lote.
- [ ] Acima de 200 linhas → 400 (validação).
- [ ] Sem plano de escrita → bloqueado (paywall).

## 9. Riscos / considerações

- **Carga:** 200 chamadas ao gateway (mock, instantâneo). Com gateway real, considerar fila.
- **Quota do plano:** não aplicada por linha (follow-up) — hoje o import pode exceder o teto
  do Free/Essencial. Registrar como dívida quando ligar cobrança real.

## 10. Notas de implementação

- **Reuso do fluxo:** `importInvoices` chama `createPayment` por linha — mesma reserva→cobra→
  link/PIX→`link_created`. `ClientRepository.findByPhones` resolve os clientes numa query.
- **Planejamento puro:** `utils/import-invoice-plan.ts` (`planInvoiceImport`) separa conhecidos
  de desconhecidos, testado isoladamente. Best-effort por linha no service.
- **Front:** `ImportInvoicesWizard` (upload/colar → mapear colunas com palpite automático →
  prévia validada → resultado com erros por linha). Aceita valor `1.234,56`/`1234.56` e data
  `AAAA-MM-DD` ou `DD/MM/AAAA`. Botão "Importar CSV" na página de Faturas.
- **Testes:** `import-invoice-plan` (3) + `invoice-import.service` (2). Suíte API: 273 verdes.
- **Follow-up:** aplicar a quota do plano por linha ao ligar cobrança real; fila para lotes
  grandes com gateway real.
