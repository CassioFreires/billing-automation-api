# Fluxo Completo do Sistema — do agendador (n8n) ao pagamento

> Documento de leitura contínua: entenda **como o sistema funciona de ponta a ponta**, desde o disparo agendado pelo n8n até a fatura ser marcada como paga. Escrito a partir do código real — onde a realidade difere do que o `README.md` "vende", está marcado com ⚠️.

Se você só quer o mapa mental, leia as duas seções "Visão em 30 segundos" e "O diagrama". O resto é detalhe.

---

## Visão em 30 segundos

Uma empresa (tenant) cadastra clientes devedores e gera cobranças. Um **agendador externo (n8n)** roda de tempos em tempos, pergunta à API "quem está em atraso?", e manda a API **enfileirar** as notificações. Um **worker** consome essa fila em segundo plano e envia a mensagem de cobrança (WhatsApp). Quando o cliente paga, o **gateway de pagamento chama a API** (webhook) e a fatura vira `PAID` — de forma idempotente. Tudo isolado por empresa (multi-tenant).

**Os 3 atores externos:**
- **n8n** — o "relógio" que dispara o ciclo (agendador/orquestrador).
- **Gateway de pagamento** (mock hoje; Mercado Pago no futuro) — gera a cobrança e avisa quando foi paga.
- **WhatsApp** — canal de entrega da mensagem (⚠️ hoje em modo `log`, não envia de verdade — dívida D-02).

---

## O diagrama (ponta a ponta)

```
                            ┌──────────────────────────────────────────┐
                            │                  n8n                      │
                            │  (agendador externo — roda no cron dele)  │
                            └───────────────┬───────────────────────────┘
                                            │
     (1) autentica:  POST /api/auth/login  │  → recebe JWT (token)
                                            │
     (2) "quem está em atraso?"             ▼
         GET /api/invoices/overdue  ───────────────►  API  ──► Postgres
                                            │          (faturas PENDING de
                                            │           clientes EM_ATRASO)
                                            ◄───────────────  lista de faturas
                                            │
     (3) "enfileira essas cobranças"        ▼
         POST /api/notifications/trigger-overdue  (array de faturas)
                                            │
                                            ▼
                          ┌─────────────────────────────────┐
                          │  API (NotificationService)       │
                          │  carimba tenantId no payload     │
                          │  publica na fila  ───────────────┼──►  RabbitMQ
                          └─────────────────────────────────┘     (INVOICE_QUEUE)
                                            │                          │
        responde 202 na hora (não trava) ◄──┘                          │
                                                                       ▼
                          ┌─────────────────────────────────────────────────┐
                          │  WORKER (processo separado — src/worker.ts)       │
                          │  consome 1 msg por vez (prefetch(1))              │
                          │   ├─ runWithTenant(tenantId)                      │
                          │   ├─ busca dados REAIS da fatura no banco         │
                          │   ├─ marca notificationSent = true                │
                          │   └─ WhatsappAPI.sendMessage  ⚠️ (hoje só LOGA)   │
                          │  ack ✓  (erro → retry limitado → DLQ)             │
                          └─────────────────────────────────────────────────┘

     ── mais tarde, o cliente paga ──────────────────────────────────────────

     (4) Gateway de pagamento  ──►  POST /api/invoices/webhook
                                     ├─ valida autenticidade (mock: x-webhook-secret;
                                     │                          MP: assinatura x-signature)
                                     ├─ acha a fatura pelo gatewayId
                                     ├─ idempotência: eventId já visto? → ignora
                                     └─ atualiza status → PAID (grava paidAt)
```

---

## Passo a passo detalhado

### 0) Pré-requisito: a empresa existe
Antes de qualquer ciclo, a empresa se cadastrou uma vez:
- `POST /api/auth/register` → cria o **Account** (o tenant) + o **User** dono.
- Cadastrou seus devedores: `POST /api/clients`.
- Gerou cobranças: `POST /api/invoices` (cada uma nasce `PENDING` e já tem um `gatewayId` do gateway).

### 1) n8n autentica
O n8n não tem sessão; a cada execução ele faz `POST /api/auth/login` com as credenciais de serviço (`AUTH_USERNAME`/`AUTH_PASSWORD`) e recebe um **JWT**. Esse token carrega o `tenantId` e é enviado como `Authorization: Bearer <token>` nas chamadas seguintes.

### 2) n8n descobre quem cobrar
`GET /api/invoices/overdue` retorna as faturas **`PENDING` de clientes com `status = EM_ATRASO`** (essa é a query de cobrança — **não** é um "listar todas as faturas"). O retorno traz, por fatura, os dados que a notificação precisa: `id`, `value`, `dueDate`, e do cliente `name`, `phone`, `document`.

### 3) n8n manda enfileirar
O n8n envia essas faturas para `POST /api/notifications/trigger-overdue` (aceita um **array** de faturas, ou uma só). Aqui está o ponto-chave de performance:

- A API **não envia nada na hora**. O `NotificationService` só **publica cada fatura na fila** do RabbitMQ (`INVOICE_QUEUE`), **carimbando o `tenantId`** no payload (RN-T5, para o worker saber em qual empresa operar).
- A API responde **`202 Accepted`** imediatamente ("recebi, vou processar"). O n8n é liberado e não fica travado esperando o envio.

> Também existe `POST /api/notifications/trigger-overdue/:invoiceId` para enfileirar **uma** fatura específica pelo ID (útil para reenvio manual).

### 4) O worker processa em segundo plano
O **worker** (`src/worker.ts`, um processo/container separado da API) fica escutando a fila:
- Pega **uma mensagem por vez** (`prefetch(1)`) — não engole a fila inteira de uma vez.
- Reabre o contexto do tenant com `runWithTenant(tenantId)` — a partir daí todo acesso ao banco fica isolado naquela empresa.
- Busca os **dados reais e atuais** da fatura no banco (`findNotificationDataById`) — inclusive o `pixCopyPaste`/`checkoutUrl` que vieram do gateway. Ele **não fabrica** a mensagem com dados do payload; relê do banco para garantir que está atualizado (dívida D-15 resolvida).
- Marca `notificationSent = true`.
- Monta a mensagem (`buildChargeMessage`) e chama `WhatsappAPI.sendMessage`.
  - ⚠️ **Hoje o provider de WhatsApp é `log`**: ele apenas escreve a mensagem no log, **não envia de verdade** (evita custo em testes — dívida **D-02**). Trocar para envio real é plugar um provider (Meta/Twilio) via `WHATSAPP_PROVIDER`.
- Confirma o processamento (`ack`).

**Se der erro:** o worker faz `nack` e a mensagem volta para a fila. As *quorum queues* contam as reentregas (`x-delivery-count`); ao passar de `INVOICE_DELIVERY_LIMIT`, a mensagem vai automaticamente para a **DLQ** (dead-letter queue) — sem loop infinito (dívida D-04 resolvida).

### 5) O cliente paga — o gateway avisa
Quando o pagamento acontece, o **gateway chama** `POST /api/invoices/webhook`. Essa rota **não usa JWT** — a autenticidade é do provider:
- **mock** (padrão, para testes): valida o header `x-webhook-secret` contra `WEBHOOK_SECRET`.
- **mercadopago**: valida a assinatura `x-signature` (HMAC).

O `InvoiceService.applyWebhook`:
1. Acha a fatura pelo `gatewayId`.
2. **Idempotência (RN-P3):** se o `eventId` já foi registrado na tabela `WebhookEvent`, responde `duplicate: true` e **não reprocessa** (gateways reenviam o mesmo evento com frequência).
3. Atualiza o `status` (ex.: `PAID`) e grava `paidAt`.
4. Limpa o cache de pendentes (Redis), se ativo.

Pronto — a fatura sai da lista de "a cobrar" e o ciclo se fecha.

---

## ⚠️ Divergência entre o README e o código (importante)

O `README.md` descreve o envio assim: *"a API consome a fila e dispara um webhook para o **n8n**; o n8n aciona o WhatsApp"*. **No código atual não é assim.** O **worker chama o `WhatsappAPI` diretamente** (hoje em modo `log`). O n8n é o **agendador/orquestrador de entrada** (passos 1–3), não o destino final do worker.

Ou seja, existem dois desenhos possíveis para a entrega:
- **(atual)** worker → `WhatsappAPI` (seam plugável: log → Meta/Twilio).
- **(alternativo, descrito no README)** worker → webhook para o n8n → n8n → WhatsApp.

Ambos são válidos; o código segue o primeiro. Ao plugar o envio real, decida qual desenho quer e **atualize este documento e o README** para não divergirem.

---

## As regras de negócio que amarram o fluxo

| Código | Regra | Onde aparece |
|---|---|---|
| RN-T (multi-tenancy) | Todo dado pertence a um `Account`; acesso ao banco **sempre** filtra por `tenantId` (via `AsyncLocalStorage`). | repositories, `tenant-context.ts` |
| RN-T3 | Telefone do cliente é **único por tenant**. | `schema.prisma` (`@@unique([tenantId, phone])`) |
| RN-T5 | O `tenantId` é **carimbado no payload** ao enfileirar, para o worker operar no escopo certo. | `notication.service.ts` |
| RN-P2 | Toda cobrança passa pelo **gateway** na criação (guarda `gatewayId`). | `invoice.service.createPayment` |
| RN-P3 | Webhook é **idempotente** por `eventId` (tabela `WebhookEvent`). | `invoice.service.applyWebhook` |
| RN-P4 | A **autenticidade do webhook** é responsabilidade do provider ativo. | `payment/*.gateway.ts` |

Estados possíveis de uma fatura: `PENDING → PAID` (pago) · `→ OVERDUE` (vencido) · `→ FAILED` (falha). Estados do cliente: `EM_DIA` · `EM_ATRASO`.

---

## Componentes e onde eles moram no código

| Componente | Arquivo(s) | Papel no fluxo |
|---|---|---|
| Rotas + auth | `src/routers/`, `src/middlewares/auth.middleware.ts` | Recebem as chamadas do n8n / gateway; exigem JWT (exceto webhook e auth). |
| Controllers | `src/controllers/` | Traduzem HTTP; sem regra de negócio. |
| Services | `src/services/` | Regra de negócio (enfileirar, aplicar webhook, criar cobrança). |
| Repositories | `src/repositories/` | Único ponto de acesso ao Postgres (via Prisma); filtram por tenant. |
| Fila | `src/messaging/` (`invoice-queue.ts`, `publish/`) | Topologia e publicação no RabbitMQ. |
| Worker | `src/works/invoice.worker.ts`, `src/worker.ts` | Consome a fila e dispara a notificação (WhatsApp). |
| Gateway seam | `src/apis/payment/` (`mock`, `mercadopago`) | Cria cobrança e valida/parseia o webhook. |
| WhatsApp seam | `src/apis/whatsapp.api.ts` | Entrega da mensagem (hoje `log`). |
| Contexto de tenant | `src/context/tenant-context.ts` | Propaga o `tenantId` por toda a chamada e dentro do worker. |

---

## Como ver o fluxo rodando (na prática)

1. Suba a stack e acompanhe o worker: `docker compose -f docker-compose.free.yml logs -f worker`.
2. Faça login (pegue o token) e dispare `POST /api/notifications/trigger-overdue` com uma fatura no corpo.
3. No log do worker você verá `📩 Invoice recebida` → `✅ Processado` (e a mensagem que *seria* enviada, já que o WhatsApp está em `log`).
4. Simule o pagamento: `POST /api/invoices/webhook` (com `x-webhook-secret`) e confira a fatura virando `PAID`.

Passo a passo de testes completo: `postman/GUIA-DE-TESTES.md`.
