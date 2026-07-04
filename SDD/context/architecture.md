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
| `/api/auth` | `auth.router.ts` | Signup (`/register`) e login (`/login`) | Público |
| `/api/notifications` | `notification.router.ts` | Disparo de cobranças | JWT |
| `/api/clients` | `clients.router.ts` | CRUD + importação CSV (`/import`) | JWT |
| `/api/invoices` | `invoice.router.ts` | Faturas e webhook | JWT (webhook: verificado pelo provider) |
| `/api/subscriptions` | `subscription.router.ts` | Assinaturas (CRUD, pause/resume, `/run` manual) | JWT |
| `/api/settings` | `settings.router.ts` | Config por tenant: `/payment`, `/whatsapp` (GET/PUT) | JWT |
| `/api/system` | `system.router.ts` | Cross-tenant: `/billing/run`, `/notifications/run` | **`x-cron-secret`** (não JWT) |
| `/api/lgpd` | `lgpd.router.ts` | Direitos do titular (export/anonimização) | JWT |
| `/api/health` | `health.router.ts` | Health check | Público |

**Segurança (D-05)**: middleware `jwtAuth` (`src/middlewares/auth.middleware.ts`) valida `Authorization: Bearer <jwt>` nas rotas internas. O **webhook** é verificado pelo **provider de pagamento ativo** (spec 0003): `mock` valida `x-webhook-secret`; `mercadopago` valida a assinatura `x-signature`. `AuthService` (async): `register` cria `Account` + `User(OWNER)` com senha em hash (`bcryptjs`) e assina JWT; `login` valida e-mail/senha por hash (fallback: conta de serviço via env). Usuários em `User` (spec 0002); `UserRepository` é global (login/signup resolvem o tenant).

**Gateway de pagamento (specs 0003, 0011, 0012)**: seam `src/apis/payment/` com `PaymentGatewayProvider` (`mock`, `mercadopago`, `infinitepay`). O provider é **resolvido por tenant** (`resolvePaymentGatewayForTenant`, a partir de `PaymentSetting`; fallback = `PAYMENT_PROVIDER`, default `infinitepay`). `InvoiceService.createPayment`/`createForSubscription` obtêm o gateway via `gatewayForTenant()`. O webhook é normalizado por `provider.verifyAndParseWebhook` e aplicado de forma **idempotente** (`WebhookEvent.recordIfNew`, RN-P3).

**WhatsApp por tenant (spec 0014)**: o worker resolve o provider de envio **por tenant e por mensagem** (`resolveWhatsappForTenant` a partir de `WhatsappSetting`): `cloud` (Meta) só se houver token+phoneNumberId, senão `log`. Config via `GET/PUT /api/settings/whatsapp` (token write-only/mascarado).

**Agendador cross-tenant (specs 0010, 0013)**: `src/routers/system.router.ts` expõe `POST /api/system/billing/run` e `/notifications/run`, protegidos pelo `cronAuth` (`src/middlewares/cron.middleware.ts`, valida `x-cron-secret` vs `authConfig.cronSecret`, `timingSafeEqual`, fail-closed — **não** é JWT, é segredo de sistema). `BillingSchedulerService.enqueueAllTenants()` faz fan-out (1 job por tenant ativo na `billing_scheduler_queue`, consumida por `billing.worker.ts` → `SubscriptionService.run`); `NotificationSchedulerService.runAllTenants()` roda inline por tenant. `AccountRepository.findActiveTenantIds()` é uma query **de sistema** (sem filtro de tenant, só acessível pelas rotas com `cronAuth`).

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
Worker consome invoice_processing_queue (dentro do runWithTenant do payload)
  → InvoiceRepository.findNotificationDataById (fatura real, escopada por tenant)
  → (se não achar a fatura: ACK e descarta)
  → InvoiceRepository.markNotificationSent (notificationSent = true; invalida cache)
  → WhatsappAPI.sendMessageWhatsapp (seam log-only) com dados REAIS (checkoutUrl/PIX)
  → ACK   (em erro: nack+requeue, até x-delivery-limit → DLQ)
```

## Decisões arquiteturais relevantes

- **Desacoplamento por fila**: o disparo HTTP responde `202 Accepted` imediatamente e o envio pesado acontece no worker → resiliência a falhas do WhatsApp e absorção de picos.
- **Filas quorum + mensagens persistentes**: garante durabilidade das notificações mesmo com restart do broker.
- **Poison-message via `x-delivery-limit` + DLQ**: erros determinísticos não ficam em requeue infinito; após N tentativas a mensagem é isolada na DLQ para inspeção.
- **Retry com backoff exponencial** (`src/infrastructure/retry.ts`) usado no bootstrap para conexões (banco, Redis, RabbitMQ).
- **Cache com fallback**: nunca derruba a request se o Redis cair.
