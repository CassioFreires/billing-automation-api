# Spec 0015 — Recebimentos (baixa manual + fonte única de pagamentos)

- **Status**: Implementada (backend + frontend)
- **Autor**: Cassio
- **Data**: 2026-07-08
- **Relacionada**: `visao-produto.md` (Módulo **M1**); [0003 gateway/webhook], [0009 recorrência]; base do M4 (Cockpit)

## 1. Problema / Motivação

Hoje uma fatura só vira `PAID` pelo **webhook do gateway**. Mas o pequeno negócio
recebe por **vários meios fora do gateway**: dinheiro, transferência/PIX manual,
maquininha, boleto pago no banco. Esses pagamentos são **invisíveis** para o
Adimplo → o painel de "quem pagou" **mente** e qualquer número de caixa (Cockpit,
M4) fica errado.

Falta um jeito de **registrar qualquer recebimento** e ter uma **fonte única** do
"dinheiro que entrou".

## 2. Objetivo

Criar a entidade **`Payment`** (registro de pagamento) e a **baixa manual**: o dono
marca uma fatura como recebida informando **meio, valor, data** e (opcional) uma
observação/comprovante. Unificar pagamentos **automáticos (gateway)** e **manuais**
como registros `Payment` — a base da conciliação completa.

**v1 (esta spec):** registro de `Payment`; baixa manual via API; o webhook passa a
gerar também um `Payment` (source=gateway). Baixa manual **quita a fatura** (assume
pagamento total).

**Fora de escopo (futuro):**
- **Pagamento parcial** (status `PARCIAL` / saldo devedor).
- **Estorno/desfazer** uma baixa manual (esbarra na máquina de estados — `PAID` é terminal; precisará de um fluxo explícito de estorno).
- **Upload de arquivo** do comprovante (v1 aceita só uma **URL** opcional; guardar arquivo no S3 é um follow-up, M1.1).

## 3. Regras de negócio

- **RN-REC1**: Registrar um pagamento (manual ou gateway) cria um `Payment` ligado à `Invoice`, escopado por `tenantId`.
- **RN-REC2**: **Baixa manual** (`POST .../payments`) marca a fatura como `PAID` (v1 = quitação total), respeitando a **máquina de estados** (`canTransitionInvoice`) e gravando `paidAt` = data do pagamento. Se a fatura já está `PAID`, a baixa é rejeitada (409) — evita duplicidade.
- **RN-REC3**: O **webhook do gateway**, ao confirmar (`PAID`), cria também um `Payment` (`source=gateway`) na **MESMA transação** de `applyWebhookAtomic`. Só cria na transição efetiva para `PAID` (não em evento duplicado/no-op), garantindo **1 pagamento por confirmação**.
- **RN-REC4**: `method` é **obrigatório na baixa manual** (validação Zod). Valores: `pix`, `dinheiro`, `transferencia`, `cartao`, `boleto`, `outro`.
- **RN-REC5**: `amount` default = valor da fatura; se informado, deve ser `> 0` (registrado para o Cockpit; em v1 não altera o "PAID").
- **RN-REC6**: Isolamento por tenant (`requireTenantId`) em toda leitura/escrita; a fatura-alvo tem de pertencer ao tenant.
- **RN-REC7**: `Payment` é `Decimal(12,2)` (dinheiro nunca é `Float` — RN-I5).

## 4. Impacto no modelo de dados

Nova entidade **`Payment`** (atualizar `context/domain-model.md`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `invoiceId` | String | FK → Invoice (`onDelete: Cascade`) |
| `tenantId` | String | FK → Account (`onDelete: Cascade`) — escopo |
| `amount` | Decimal(12,2) | valor recebido |
| `method` | String? | `pix`/`dinheiro`/`transferencia`/`cartao`/`boleto`/`outro` (obrigatório p/ manual) |
| `source` | String | `manual` \| `gateway` |
| `paidAt` | DateTime | data do recebimento |
| `note` | String? | observação livre |
| `receiptUrl` | String? | URL de comprovante (upload real = futuro) |
| `createdAt` | DateTime | `now()` |

Índices: `@@index([invoiceId])`, `@@index([tenantId])`, `@@index([tenantId, paidAt])` (Cockpit: soma por período). Migration aditiva/idempotente (`CREATE TABLE IF NOT EXISTS` + FKs guardadas), no padrão das anteriores.

Transições: a baixa manual usa `canTransitionInvoice(atual, 'PAID')`.

## 5. Contrato de API

```
POST /api/invoices/:id/payments                    (JWT)  — baixa manual
Body: {
  method: "pix"|"dinheiro"|"transferencia"|"cartao"|"boleto"|"outro",
  amount?: number,            // default = valor da fatura
  paidAt?: string(ISO date),  // default = agora
  note?: string,
  receiptUrl?: string(url)
}
Response: 201 { payment, invoice }        // invoice já com status PAID
          400 { error }                    // validação (method inválido, amount<=0)
          404 { error }                    // fatura não encontrada no tenant
          409 { error }                    // fatura já paga (transição inválida)

GET /api/invoices/:id/payments                     (JWT)
Response: 200 { payments: [ ...Payment ] }
```

## 6. Fluxo / Processamento

**Baixa manual:**
```
POST /api/invoices/:id/payments
  → PaymentController.registerManual (valida DTO)
  → PaymentService.registerManual(invoiceId, dto)
       → InvoiceRepository.findById (escopo tenant; 404 se não achar)
       → checa canTransitionInvoice(status, 'PAID')  (409 se já PAID)
       → transação: cria Payment(source=manual) + Invoice.status=PAID/paidAt
       → invalida cache de pendentes
```

**Gateway (ajuste no fluxo existente):**
```
webhook → InvoiceService.applyWebhook → InvoiceRepository.applyWebhookAtomic
  → (na mesma tx, quando a transição para PAID acontece de fato)
     cria Payment(source=gateway, amount=valor da fatura, paidAt)
```

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `Payment`
- [ ] DTO — `src/dtos/payment.dto.ts` (Zod: method enum, amount>0 opcional, paidAt/note/receiptUrl opcionais)
- [ ] Repository — `src/repositories/payment.repository.ts` (create, findByInvoice) + `invoice.repository.applyWebhookAtomic` cria Payment gateway
- [ ] Service — `src/services/payment.service.ts` (registerManual, listByInvoice)
- [ ] Controller — `src/controllers/payment.controller.ts`
- [ ] Router — rotas aninhadas em `invoice.router.ts` (`/:id/payments`)
- [ ] Testes — payment.service (baixa marca PAID; 409 se já paga; method inválido) + webhook cria Payment
- [ ] Docs — `context/domain-model.md` (entidade + RN-REC*), `visao-produto.md` (M1 → em andamento)

## 8. Critérios de aceite

- [ ] Dado uma fatura `PENDING`, quando faço `POST /:id/payments` com `method=dinheiro`, então nasce um `Payment(source=manual)` e a fatura vira `PAID` com `paidAt`.
- [ ] Dado uma fatura já `PAID`, quando tento baixa manual, então recebo **409** e nenhum `Payment` é criado.
- [ ] Dado `method` inválido/ausente, então **400**.
- [ ] Dado o webhook confirmando pagamento, então além de `PAID` é criado um `Payment(source=gateway)` — e um evento **duplicado** não cria um segundo `Payment`.
- [ ] `GET /:id/payments` lista os pagamentos da fatura, escopado por tenant.
- [ ] Valores monetários trafegam como `number` na API (middleware `serializeDecimal`).

## 9. Riscos / considerações

- **Estorno**: como `PAID` é terminal (`canTransitionInvoice`), uma baixa manual errada **não** tem "desfazer" nesta v1. Registrar em `tech-debt` e planejar um fluxo de estorno explícito (M1.1).
- **Parcial**: v1 assume quitação total; um pagamento parcial marcaria `PAID` indevidamente. Documentar a limitação; status `PARCIAL` fica para depois.
- **Comprovante**: só URL em v1; upload real depende de storage (reusar o S3 do backup) — follow-up.
- **Idempotência do gateway**: garantir que o `Payment(gateway)` só nasce na transição efetiva (não em webhook duplicado) — testar.

## 10. Notas de implementação

Implementado no backend em 2026-07-08. Entidade `Payment` (migration
`20260708000000_payments`), DTO Zod (`payment.dto.ts`), `PaymentService`
(registerManual/listByInvoice, com `NotFoundError`/`ConflictError`),
`PaymentController`, rotas aninhadas em `invoice.router.ts`. Writes atômicos
(`InvoiceRepository.settleManually` e o `Payment(gateway)` dentro de
`applyWebhookAtomic`); regra anti-duplicação extraída para
`shouldRecordGatewayPayment` (pura, testada). Leitura em `PaymentRepository`.

- **Bug pego em teste**: `canTransitionInvoice('PAID','PAID')` é no-op permitido,
  então a guarda de baixa manual precisou de um check **explícito** de "já PAID"
  → 409 (senão criaria pagamento duplicado). Corrigido no service.
- Build limpo; 146 testes (novos: `payment.service`, `shouldRecordGatewayPayment`).
- **Frontend (entregue)**: `billing-automation-web` — `payments.service.ts` + `usePayments`/`useRegisterPayment`; na página de Faturas, botão "Dar baixa" (linha + modal de detalhe), modal de baixa (meio, valor default = total, data, observação) e seção "Recebimentos" listando pagamentos manuais e de gateway.
- **Follow-ups (tech-debt)**: estorno de baixa, pagamento parcial, upload de comprovante (S3) — D-22.
