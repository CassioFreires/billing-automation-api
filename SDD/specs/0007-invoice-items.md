# Spec 0007 — Itens de fatura (detalhe do que é cobrado)

- **Status**: Implementada (backend)
- **Autor**: Cassio
- **Data**: 2026-07-03

## 1. Problema / Motivação

A fatura só tinha `value` + `dueDate` — não registrava **o quê** estava sendo cobrado. Um sistema de cobrança precisa do detalhe (produtos/serviços) para clareza, comprovação e futura emissão fiscal.

## 2. Objetivo

Permitir que uma fatura tenha **itens** (linhas): descrição, quantidade e valor unitário. O **total** da fatura passa a ser a soma de `quantity * unitPrice`. Retrocompatível: criar fatura só com `value` (sem itens) continua válido.

**Fora de escopo:** catálogo de produtos reutilizáveis (pode virar spec futura).

## 3. Regras de negócio

- RN-P6: quando há **itens**, o total da fatura = Σ(`quantity * unitPrice`); o `value` enviado é ignorado. Sem itens, usa-se o `value`.
- RN-P7: criar fatura exige **`value > 0` OU ao menos um item** (validação Zod).
- Itens pertencem à fatura (cascade no delete); acesso sempre via a fatura (escopo de tenant herdado).

## 4. Modelo de dados

Novo model `InvoiceItem` (`id`, `description`, `quantity` [int, default 1], `unitPrice` [float], `invoiceId` FK cascade). `Invoice.items InvoiceItem[]`. Migration `20260703000000_invoice_items` (aditiva, idempotente).

## 5. Contrato de API

```
POST /api/invoices            (JWT)
Body: {
  clientId, dueDate,
  value?,                       // opcional se houver items
  items?: [ { description, quantity?, unitPrice } ]
}
→ 201 invoice (com items). value final = soma dos itens (se houver).
```

`GET /api/invoices` e `GET /api/invoices/:id` retornam a fatura **com `items`**.

## 6. Camadas afetadas

- [x] Schema Prisma + migration
- [x] DTO (`createInvoice.dto.ts`: `invoiceItemSchema` + refine)
- [x] Service (`createPayment`: total a partir dos itens)
- [x] Repository (`create` persiste itens; `findAll`/`findById` incluem itens)
- [ ] Frontend (criar com itens + detalhe exibindo) — próximo item

## 7. Notas

Gateway/webhook/dashboard seguem usando `value` (o total) — sem impacto. Seed de dev inclui um item por fatura para exercitar a UI.
