# Spec 0003 — Gateway de Pagamento (Mercado Pago) + Idempotência do Webhook

- **Status**: Implementada (2026-07-01)
- **Autor**: —
- **Data**: 2026-07-01
- **Roadmap**: PR-02 (gateway real) e PR-03 (idempotência do webhook)
- **Dívida relacionada**: D-15 (mock de gateway/PIX espalhado)
- **Depende de**: 0001 (multi-tenancy)

## 1. Problema / Motivação

Hoje a cobrança é **mockada** (`gatewayId`/PIX via `Math.random`) e o webhook **reprocessa eventos duplicados**. Para funcionar de verdade, precisamos gerar cobranças reais (PIX, crédito, débito, boleto) num gateway com sandbox gratuito e tratar as notificações de pagamento de forma **idempotente**.

## 2. Objetivo

Integrar o **Mercado Pago** via **Checkout Pro** (a API de *preferences* devolve uma URL de checkout hospedada que oferece PIX/crédito/débito/boleto), tratar o **webhook** de pagamento (com validação de assinatura e consulta do pagamento) e garantir **idempotência**.

**Seam**: um contrato `PaymentGatewayProvider` selecionável por `PAYMENT_PROVIDER` (default `mock` = comportamento atual; `mercadopago` = real/sandbox). Isso mantém tudo retrocompatível e testável.

**Fora de escopo**: tokenização de cartão no front (Checkout Pro hospeda o pagamento), split, assinaturas recorrentes, reconciliação financeira, mapeamento de clientes ↔ payer do MP (usamos `payer.email` simples).

## 3. Regras de negócio

- **RN-P1**: `createCharge` cria a cobrança no provider ativo e retorna `{ gatewayId, checkoutUrl?, pixCopyPaste?, pixQrCode? }`. A `Invoice` guarda o que houver.
- **RN-P2**: O `gatewayId` é o identificador que localiza a fatura no webhook (para o MP, usamos um `external_reference` próprio, único).
- **RN-P3 (idempotência)**: cada evento de webhook tem um id único (para o MP, o id do pagamento). Se o id já foi processado, o webhook é **no-op** (200, sem reaplicar).
- **RN-P4**: A verificação de autenticidade do webhook é **do provider**: `mock` valida `x-webhook-secret`; `mercadopago` valida a assinatura `x-signature` (HMAC).
- **RN-P5**: Mapeamento de status MP → Invoice: `approved`→`PAID`, `pending`/`in_process`→`PENDING`, `rejected`/`cancelled`→`FAILED`, `refunded`/`charged_back`→`FAILED`.
- **RN-P6**: O webhook resolve o tenant pela fatura (RN-T6) — segue global.

## 4. Impacto no modelo de dados

- `Invoice.checkoutUrl String?` — URL do Checkout Pro (quando o provider a fornece).
- Nova entidade `WebhookEvent` (idempotência): `id` (event id do provider, PK), `provider`, `receivedAt`. Global (não escopada por tenant).

## 5. Contrato de API

```
POST /api/invoices                 (JWT) — cria cobrança via provider ativo
  → 201 { ...invoice, checkoutUrl?, pixCopyPaste? }

POST /api/invoices/webhook         (verificação do provider) — notificação de pagamento
  mock:        body { gatewayId, status, paidAt?, eventId? } + header x-webhook-secret
  mercadopago: body/query do MP + header x-signature  → busca o pagamento e atualiza
  → 200 { success, duplicate }
```

## 6. Fluxo

**Cobrança**: `createPayment` → `gateway.createCharge` → cria `Invoice` com `gatewayId` (+ `checkoutUrl`/PIX).
**Webhook**: controller → `gateway.verifyAndParseWebhook(req)` → `{ eventId, gatewayId, status, paidAt }` (ou 401/inválido) → idempotência (`WebhookEvent.recordIfNew`) → se novo, `updateStatus` na fatura localizada por `gatewayId`.

## 7. Camadas afetadas

- [ ] Schema/migration — `Invoice.checkoutUrl`, `WebhookEvent`
- [ ] DTO — `updateInvoiceStatusSchema` ganha `eventId?`
- [ ] APIs — `src/apis/payment/` (types, mock, mercadopago, resolver/facade)
- [ ] Repository — `webhook-event.repository.ts`; `invoice.repository.create` aceita `pixQrCode`/`checkoutUrl`
- [ ] Service — `InvoiceService.createPayment` usa provider; `receiveWebhookNotification` idempotente
- [ ] Controller/Router — webhook usa verificação do provider
- [ ] Config/env — `PAYMENT_PROVIDER`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_NOTIFICATION_URL`, `MP_BASE_URL`
- [ ] Testes — mock provider, mapeamento de status, idempotência, DTO

## 8. Critérios de aceite

- [ ] Com `PAYMENT_PROVIDER=mock`, o comportamento atual é preservado (nada quebra).
- [ ] Com `PAYMENT_PROVIDER=mercadopago` + token de sandbox, `POST /api/invoices` cria uma preferência e retorna `checkoutUrl` funcional.
- [ ] Pagando no sandbox, o webhook do MP atualiza a fatura para `PAID`.
- [ ] Reenvio do mesmo evento não reaplica (idempotência) → 200 duplicate.
- [ ] Assinatura de webhook inválida → 401.

## 9. Riscos / considerações

- **Não testável aqui**: as chamadas reais ao MP exigem `MP_ACCESS_TOKEN` de sandbox e rede — validar no ambiente com a conta de sandbox. Os testes cobrem o mock, o mapeamento de status e a idempotência.
- **Assinatura MP**: seguir o algoritmo `x-signature` (`ts` + `id` + secret). Se mudar, ajustar.
- **Idempotência**: `recordIfNew` antes de aplicar; hardening transacional (record+update atômicos) fica como follow-up.
- **Cliente ↔ payer**: usamos `payer.email` simples; mapear clientes a customers do MP é follow-up.

## 10. Notas de implementação

- `fetch` nativo (Node 18+), sem SDK, contra `MP_BASE_URL` (default `https://api.mercadopago.com`).
- Checkout Pro: `POST /checkout/preferences` → usa `sandbox_init_point` como `checkoutUrl`; `external_reference` = `gatewayId` gerado por nós.
- Webhook MP: `type=payment` + `data.id` → `GET /v1/payments/{id}` → `status`/`external_reference`/`date_approved`. `eventId` = id do pagamento.
- Ordem: schema/migration → generate → provider seam → repo/service/controller → testes → docs.
