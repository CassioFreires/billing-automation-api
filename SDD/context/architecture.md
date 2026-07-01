# Arquitetura

## Estilo

Arquitetura **em camadas (layered)** com separação clara de responsabilidades, mais um **worker assíncrono** desacoplado por fila de mensagens.

```
HTTP  →  Router  →  Controller  →  Service  →  Repository  →  Prisma  →  PostgreSQL
                        │                          ▲
                        │ (enfileira)              │ (lê/escreve)
                        ▼                          │
                     RabbitMQ  ───────────────►  Worker  ──►  WhatsAppAPI (stub)
                                                    │
                                                  Redis (cache de leitura, opcional)
```

## Responsabilidade de cada camada

| Camada | Pasta | Responsabilidade | Regra |
|---|---|---|---|
| **Router** | `src/routers/` | Mapear método+rota → handler do controller | Sem lógica; só roteamento |
| **Controller** | `src/controllers/` | Validar entrada (DTO/Zod), traduzir HTTP ↔ domínio, montar resposta e status | Sem regra de negócio nem acesso a banco |
| **Service** | `src/services/` | Regras de negócio, orquestração, enfileiramento | Sem `req`/`res`; sem SQL direto |
| **Repository** | `src/repositories/` | Acesso a dados via Prisma; cache | Único lugar que fala com o banco |
| **DTO** | `src/dtos/` | Contrato de entrada e validação (Zod ou manual) | — |
| **Infra/Config** | `src/config/`, `src/infrastructure/`, `src/messaging/`, `src/apis/`, `src/database/` | Conexões (RabbitMQ, Redis, Prisma), retry, publish/consume, integrações externas | — |
| **Worker** | `src/works/`, `src/worker.ts` | Consumir filas e processar de forma assíncrona | — |

## Componentes principais

### API HTTP (Express 5)
- Entrypoint: **`src/server.ts`** → compila para `dist/server.js` (script `serve`).
- Prefixo global: `/api` (montado em `appRouter`, definido em `src/index.ts`).
- Middlewares: `express.json()`, `cors()`.
- Health check duplo: `GET /health` (no server) e `GET /api/health` (via `healthRouter`).

### Roteamento
`appRouter` (`src/index.ts`) agrega os sub-routers:

| Prefixo | Router | Domínio | Proteção |
|---|---|---|---|
| `/api/auth` | `auth.router.ts` | Login / emissão de JWT | Público |
| `/api/notifications` | `notification.router.ts` | Disparo de cobranças | JWT |
| `/api/clients` | `clients.router.ts` | CRUD de clientes | JWT |
| `/api/invoices` | `invoice.router.ts` | Faturas e webhook | JWT (webhook: segredo) |
| `/api/health` | `health.router.ts` | Health check | Público |

**Segurança (D-05)**: middleware `jwtAuth` (`src/middlewares/auth.middleware.ts`) valida `Authorization: Bearer <jwt>` nas rotas internas; `webhookAuth` (`src/middlewares/webhook.middleware.ts`) valida `x-webhook-secret` no webhook. Login em `AuthService` valida conta de serviço via env e assina JWT (`jsonwebtoken`).

**Multi-tenancy (spec 0001)**: o JWT carrega `tenantId`. `jwtAuth` roda a request dentro de `runWithTenant` (`src/context/tenant-context.ts`, AsyncLocalStorage); os repositórios leem `requireTenantId()` e escopam todas as queries. Na fila, o `tenantId` viaja no payload e o worker abre o mesmo contexto. O webhook resolve o tenant pela fatura (id global do gateway).

### Mensageria (RabbitMQ / amqplib)
- Config singleton: `src/config/rabbitmql.config.ts` (`rabbitMQ` — gerencia conexão e canal).
- **Topologia centralizada**: `src/messaging/invoice-queue.ts` — fonte única dos nomes e do `assertInvoiceQueueTopology(channel)`. Declara:
  - Fila principal **`invoice_processing_queue`** (durável, `quorum`, mensagens persistentes) com `x-delivery-limit = 5` e `x-dead-letter-exchange`.
  - DLX `invoice_processing_dlx` (fanout) + DLQ `invoice_processing_queue.dlq`.
- A topologia é declarada **no startup** (`server.ts` sempre; worker também). O publisher (`publish.messaging.ts`) só faz `sendToQueue` — não redeclara (evita `PRECONDITION_FAILED`).
- `consumer.messaging.ts` é um **template genérico não usado** (consome `task_queue`) — ver `tech-debt.md` (D-10).

### Worker
- `initInvoiceWorker()` (`src/works/invoice.worker.ts`): garante a topologia, `prefetch(1)`, ACK manual. Em erro faz `nack(requeue)` — mas agora o retry é **limitado** pelo `x-delivery-limit` da quorum queue: após 5 reentregas a mensagem vai para a DLQ (D-04).
- **Onde roda (D-03)**: por padrão a API também consome (monólito). Para topologia com worker isolado (`npm run worker`), defina `RUN_WORKER_INLINE=false` na API — assim há um único consumidor.

### Cache (Redis, opcional)
- Config: `src/config/redis.config.ts`. Habilitado por `REDIS_ENABLED=true`.
- Se desabilitado/indisponível, a aplicação **continua funcionando sem cache** (fallback gracioso).
- Usado em `InvoiceRepository.findPendingInvoices` (TTL 60s, chave `pending-invoices:{page}:{limit}`), invalidado em escritas via `clearPendingInvoicesCache()`.

### Persistência (Prisma + PostgreSQL)
- Cliente único: `src/database/prisma.ts` (`PrismaClient` default export).
- Schema: `prisma/schema.prisma`. Migrations em `prisma/migrations/`.

## Fluxos de dados detalhados

### Fluxo A — Gerar cobrança
```
POST /api/invoices
  → InvoiceController.create        (valida com createInvoiceSchema/Zod)
  → InvoiceService.createPayment    (mock: gera gatewayId + pixCopyPaste)
  → InvoiceRepository.create        (status inicial PENDING)
```

### Fluxo B — Confirmar pagamento (webhook)
```
POST /api/invoices/webhook
  → InvoiceController.handleWebhook  (valida com updateInvoiceStatusSchema)
  → InvoiceService.receiveWebhookNotification
       → InvoiceRepository.findByGatewayId
       → InvoiceRepository.updateStatus (PAID/FAILED/... + paidAt; invalida cache)
```

### Fluxo C — Disparar notificação de cobrança
```
POST /api/notifications/trigger-overdue        (array de faturas)
  → NotificationController.triggerOverdueNotifications
  → NotificationService.queueOverdueInvoices → publishRabbitMql → fila

POST /api/notifications/trigger-overdue/:invoiceId   (por ID)
  → NotificationController.triggerByInvoice
  → NotificationService.triggerByInvoice
       → InvoiceRepository.findNotificationDataById
       → enqueue → fila
```

### Fluxo D — Processamento assíncrono (worker)
```
Worker consome invoice_processing_queue
  → ClientRepository.findByPhone
  → (se não achar cliente: ACK e descarta)
  → gera fakeGatewayId + fakePix
  → InvoiceRepository.updateNotificationData (notificationSent = true; invalida cache)
  → WhatsappAPI.sendMessageWhatsapp (STUB)
  → ACK   (em erro: nack+requeue, até x-delivery-limit → DLQ)
```

## Decisões arquiteturais relevantes

- **Desacoplamento por fila**: o disparo HTTP responde `202 Accepted` imediatamente e o envio pesado acontece no worker → resiliência a falhas do WhatsApp e absorção de picos.
- **Filas quorum + mensagens persistentes**: garante durabilidade das notificações mesmo com restart do broker.
- **Poison-message via `x-delivery-limit` + DLQ**: erros determinísticos não ficam em requeue infinito; após N tentativas a mensagem é isolada na DLQ para inspeção.
- **Retry com backoff exponencial** (`src/infrastructure/retry.ts`) usado no bootstrap para conexões (banco, Redis, RabbitMQ).
- **Cache com fallback**: nunca derruba a request se o Redis cair.
