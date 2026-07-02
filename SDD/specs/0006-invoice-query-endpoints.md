# Spec 0006 — Endpoints de consulta de faturas (listar / buscar por id)

- **Status**: Implementada
- **Autor**: Cassio
- **Data**: 2026-07-02
- **Dívida relacionada**: bug do `count` sem `tenantId` em `findPendingInvoices` (corrigido junto)

## 1. Problema / Motivação

A API só tinha `GET /api/invoices/overdue`, que lista faturas `PENDING` **de clientes `EM_ATRASO`** (query de cobrança, não de consulta geral). Faltava:
- **listar todas** as faturas do tenant (qualquer status), e
- **buscar uma** fatura por id (ex.: ver uma cobrança já `PAID`).

O frontend precisa das duas. Sem elas, a única forma de ver uma fatura paga era via `/api/lgpd/.../export` (gambiarra).

## 2. Objetivo

Adicionar dois endpoints de leitura, isolados por tenant e paginados:
- `GET /api/invoices` — lista todas (filtro opcional por status).
- `GET /api/invoices/:id` — busca uma.

**Fora de escopo:** filtros por período/cliente, ordenação configurável (podem virar evolução).

## 3. Regras de negócio

- RN-I4: Ambos retornam **apenas** faturas do tenant do token (isolamento — `requireTenantId()` no repositório).
- RN-I5: `GET /:id` de fatura inexistente **ou de outro tenant** retorna `404` (não vaza existência entre tenants).
- RN-I6: filtro `status` aceita apenas `PENDING | PAID | OVERDUE | FAILED`; valor inválido → `400`.

## 4. Impacto no modelo de dados

Nenhum. Apenas leitura sobre o schema existente.

## 5. Contrato de API

```
GET /api/invoices?page=1&limit=10&status=PAID        (JWT)
Response: 200 { message: "OK", result: { invoices: [...], meta: {...} } }
          400 { error }  (status inválido)

GET /api/invoices/:id                                 (JWT)
Response: 200 { ...invoice, client: {...} }
          404 { error: "Fatura não encontrada" }
```

Ordem de rotas: `/` e `/overdue` (literais) **antes** de `/:id` (paramétrica), senão `/overdue` cairia no handler de `:id`.

## 6. Fluxo / Processamento

Leitura direta: controller → service → repository (`findAll` / `findById`), ambos filtrando por `requireTenantId()`. Sem fila, sem cache.

## 7. Camadas afetadas

- [x] Repository — `findAll`, `findById` + **bugfix** do `count` sem `tenantId`
- [x] Service — `listInvoices`, `getInvoiceById`
- [x] Controller — `findAll`, `findById` (valida `status`)
- [x] Router — `GET /`, `GET /:id` (ordem cuidada)
- [x] Testes — service (list/getById)

## 8. Critérios de aceite

- [x] `GET /api/invoices` lista faturas do tenant paginadas.
- [x] `GET /api/invoices?status=PAID` filtra por status.
- [x] `GET /api/invoices?status=XPTO` → 400.
- [x] `GET /api/invoices/:id` existente → 200 com dados do cliente.
- [x] `GET /api/invoices/:id` inexistente → 404.
- [x] `GET /api/invoices/overdue` continua funcionando (não capturado por `/:id`).

## 9. Riscos / considerações

- **Isolamento**: garantido por `requireTenantId()` em ambos os métodos.
- **Bugfix associado**: o `count` de `findPendingInvoices` não filtrava por `tenantId` — corrigido (o total vazava contagem de outros tenants).

## 10. Notas de implementação

Implementado em 2026-07-02. `include` do cliente com `select` enxuto (id/name/phone/document/status) para não trafegar campos sensíveis desnecessários.
