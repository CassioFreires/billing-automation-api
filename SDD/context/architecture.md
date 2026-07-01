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

| Prefixo | Router | Domínio |
|---|---|---|
| `/api/notifications` | `notification.router.ts` | Disparo de cobranças |
| `/api/clients` | `clients.router.ts` | CRUD de clientes |
| `/api/invoices` | `invoice.router.ts` | Faturas e webhook |
| `/api/health` | `health.router.ts` | Health check |

### Mensageria (RabbitMQ / amqplib)
- Config singleton: `src/config/rabbitmql.config.ts` (`rabbitMQ` — gerencia conexão e canal).
- Publish: `src/messaging/publish/publish.messaging.ts` → `publishRabbitMql(queue, msg)`.
- Fila de trabalho: **`invoice_processing_queue`** (durável, tipo `quorum`, mensagens persistentes).
- `consumer.messaging.ts` é um **template genérico não usado** (consome `task_queue`) — ver `tech-debt.md`.

### Worker
- `initInvoiceWorker()` (`src/works/invoice.worker.ts`): assina `invoice_processing_queue`, `prefetch(1)`, ACK manual, `nack(requeue)` em erro.
- **Roda em dois lugares**: dentro do `server.js` (bootstrap) **e** como processo isolado (`src/worker.ts`). ⚠️ Isso é uma ambiguidade de design — ver `tech-debt.md`.

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
  → ACK   (ou nack+requeue em erro)
```

## Decisões arquiteturais relevantes

- **Desacoplamento por fila**: o disparo HTTP responde `202 Accepted` imediatamente e o envio pesado acontece no worker → resiliência a falhas do WhatsApp e absorção de picos.
- **Filas quorum + mensagens persistentes**: garante durabilidade das notificações mesmo com restart do broker.
- **Retry com backoff exponencial** (`src/infrastructure/retry.ts`) usado no bootstrap para conexões (banco, Redis, RabbitMQ).
- **Cache com fallback**: nunca derruba a request se o Redis cair.
