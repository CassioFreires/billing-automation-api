# Documentação Técnica — Adimplo (billing-automation-api)

> Arquitetura de software, comunicação entre componentes, mensageria, filas e
> workers. Público: equipe técnica, integradores e homologação. Versão viva —
> reflete o código em produção (`https://useadimplo.com.br`).

---

## 1. Visão geral

O Adimplo é uma **plataforma SaaS multi-tenant de automação de cobrança**. Uma
única instalação atende vários clientes (tenants) com dados isolados. O sistema
cadastra clientes e assinaturas, **gera cobranças automaticamente**, dispara
notificações (WhatsApp / e-mail) de forma **assíncrona** e concilia pagamentos
via **webhook** do gateway.

```
┌────────────┐   HTTPS    ┌──────────┐   /api/*   ┌───────────────┐
│  Navegador │ ─────────► │  Caddy    │ ─────────► │  API (Node)   │
│  (React)   │            │ (proxy +  │            │  Express 5    │
└────────────┘            │  HTTPS)   │            └──────┬────────┘
                          └──────────┘                    │ enfileira
        cron diário ─────────────────────────────►  ┌─────▼──────┐
   (x-cron-secret) → /api/system/*                    │  RabbitMQ  │
                                                       └─────┬──────┘
   Gateway paga ──► POST /api/invoices/webhook               │ consome
                                                       ┌──────▼──────┐
                                                       │   Worker    │──► WhatsApp / E-mail
                                                       └──────┬──────┘
                                             Postgres ◄───────┘  Redis (cache opcional)
```

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js (ESM, `type: module`) + TypeScript 6 (`strict`) |
| API HTTP | Express 5 |
| ORM / Banco | Prisma 6 + PostgreSQL 17 |
| Mensageria | RabbitMQ 4 (amqplib) — filas quorum + DLQ |
| Cache | Redis 7 (opcional, fallback gracioso) |
| Validação | Zod 4 (DTOs) |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| Segurança | helmet, express-rate-limit, CORS |
| Cripto | AES-256-GCM (segredos por tenant em repouso) |
| Frontend | React 19 + Vite 8 + Tailwind 4 + React Query 5 (repo `billing-automation-web`) |
| Infra | Docker Compose + Caddy (reverse proxy + Let's Encrypt) |
| Testes | Vitest |

> **Regra de ouro do repo:** imports internos usam extensão `.js` mesmo em
> arquivos `.ts` (ESM/NodeNext). Regra de negócio no *service*, banco só no
> *repository*, controller só traduz HTTP.

---

## 3. Arquitetura em camadas

```
HTTP → Router → Controller → Service → Repository → Prisma → PostgreSQL
                    │                       ▲
                    │ (enfileira)           │ (lê/escreve)
                    ▼                       │
                 RabbitMQ ───────────────► Worker ──► WhatsApp/E-mail (seams)
```

| Camada | Pasta | Responsabilidade | Não pode |
|---|---|---|---|
| Router | `src/routers/` | Mapear rota → handler | Ter lógica |
| Controller | `src/controllers/` | Validar (Zod), traduzir HTTP↔domínio | Regra de negócio / SQL |
| Service | `src/services/` | Regra de negócio, orquestração, enfileiramento | `req`/`res`, SQL direto |
| Repository | `src/repositories/` | Acesso a dados (Prisma), cache | — |
| DTO | `src/dtos/` | Contrato de entrada (Zod) | — |
| Infra | `src/config/`, `src/infrastructure/`, `src/messaging/`, `src/apis/` | Conexões, retry, integrações | — |
| Worker | `src/works/`, `src/worker.ts` | Consumir filas, processar assíncrono | — |

### Seams (pontos de troca por contrato)
- **Pagamento** (`src/apis/payment/`): `PaymentGatewayProvider` — `mock`,
  `mercadopago`, `infinitepay` + Asaas/PagBank/Efí/Stripe/Pagar.me. Resolvido
  **por tenant** (`resolvePaymentGatewayForTenant`), fallback via env.
- **WhatsApp** (`src/apis/whatsapp.api.ts`): `WhatsappProvider` — `log` (default)
  ou `cloud` (Meta Cloud API). Resolvido por tenant (`resolveWhatsappForTenant`).
- **E-mail** (`src/apis/email.api.ts`): `EmailProvider` — `log` (default) ou
  `smtp` (`SmtpEmailProvider` via nodemailer, genérico p/ Resend/Brevo/Gmail/SES/
  Mailtrap). Controlado por `EMAIL_PROVIDER` + `SMTP_*`/`EMAIL_FROM`.

Trocar de provider = mudar env/config do tenant; nenhum outro código muda.

---

## 4. Roteamento (API)

| Prefixo | Domínio | Proteção |
|---|---|---|
| `/api/auth` | signup (`/register`), login | Público |
| `/api/clients` | CRUD + import CSV (`/import`) | JWT |
| `/api/invoices` | faturas + `/webhook` | JWT (webhook: provider) |
| `/api/subscriptions` | assinaturas (CRUD, pause/resume, `/run`) | JWT |
| `/api/notifications` | disparo de cobranças | JWT |
| `/api/settings` | config por tenant: `/payment`, `/whatsapp`, `/channel` | JWT |
| `/api/cockpit` | KPIs, aging, fila de ações | JWT |
| `/api/lgpd` | direitos do titular (export/anonimização) | JWT |
| `/api/system` | cross-tenant: `/billing/run`, `/notifications/run` | **`x-cron-secret`** |
| `/api/health` | health check | Público |

**Autenticação:** `jwtAuth` valida `Authorization: Bearer <jwt>`. O JWT carrega
`sub`/`tenantId`/`role`. O **webhook** é verificado pelo *provider de pagamento
ativo* (mock = `x-webhook-secret`; mercadopago = assinatura `x-signature`). Os
endpoints de sistema usam `x-cron-secret` (`timingSafeEqual`, fail-closed), não JWT.

---

## 5. Multi-tenancy

- O JWT carrega o `tenantId`.
- `jwtAuth` roda a request dentro de `runWithTenant()` (`AsyncLocalStorage`,
  `src/context/tenant-context.ts`).
- Todo repository lê `requireTenantId()` e **escopa todas as queries** —
  nenhuma consulta "vaza" dados de outro tenant.
- Na fila, o `tenantId` viaja no payload; o worker reabre o mesmo contexto.
- O webhook resolve o tenant pela fatura (id global do gateway).
- Configurações de pagamento e WhatsApp são **por tenant** (cada cliente recebe
  no *seu* gateway e envia pelo *seu* WhatsApp). Tokens **cifrados em repouso**.

---

## 6. Mensageria, filas e workers (o coração assíncrono)

### Por que fila?
O disparo HTTP responde **`202 Accepted` na hora** e o envio pesado (WhatsApp/
e-mail) acontece no worker. Isso dá **resiliência** a falhas do canal e **absorve
picos** sem travar a API.

### Topologia (RabbitMQ)
Fonte única em `src/messaging/invoice-queue.ts`
(`assertInvoiceQueueTopology`), declarada no **startup** (API e worker):

- **`invoice_processing_queue`** — fila principal, durável, tipo **quorum**,
  mensagens persistentes, `x-delivery-limit = 5`, `x-dead-letter-exchange`.
- **`invoice_processing_dlx`** (fanout) → **`invoice_processing_queue.dlq`** —
  para onde vão as mensagens após 5 reentregas (poison message isolada, **sem
  loop infinito**).
- **`billing_scheduler_queue`** — fan-out do agendador recorrente (1 job por tenant).

O publisher só faz `sendToQueue` (não redeclara → evita `PRECONDITION_FAILED`).

### Worker (`src/works/invoice.worker.ts`)
1. `prefetch(1)` — pega **uma mensagem por vez** (ACK manual).
2. `runWithTenant(tenantId)` — reabre o contexto do tenant.
3. Busca os **dados reais e atuais** da fatura (`findNotificationDataById`) —
   não confia no payload; relê do banco (checkoutUrl/PIX atualizados).
4. Resolve os canais: `resolveChannels(preferido, { hasEmail })`
   (`src/domain/channels.ts`) → `whatsapp` | `email` | `both` com **fallback**
   para WhatsApp quando o cliente não tem e-mail (telefone é obrigatório).
5. Para cada canal, envia (WhatsApp por tenant / E-mail) e registra evento
   `sent` por canal (base do Elo/M4/M5).
6. **Sucesso em qualquer canal** marca a fatura como notificada; **falha em
   todos** → `nack` (requeue) → após `x-delivery-limit` → **DLQ**.

### Onde o worker roda
- Default (monólito): a API também consome (`RUN_WORKER_INLINE` ligado).
- Produção: worker **isolado** (`RUN_WORKER_INLINE=false` na API + `npm run worker`)
  → um único consumidor. Escala horizontal = mais containers de worker na mesma fila.

---

## 7. Fluxos de dados (ponta a ponta)

### A — Gerar cobrança
```
POST /api/invoices → InvoiceController.create (Zod)
  → InvoiceService.createPayment (gateway do tenant gera gatewayId + pixCopyPaste/checkoutUrl)
  → InvoiceRepository.create (status PENDING)
```

### B — Confirmar pagamento (webhook, idempotente)
```
POST /api/invoices/webhook (verificado pelo provider)
  → acha fatura por gatewayId
  → idempotência: eventId já visto? (WebhookEvent.recordIfNew) → ignora
  → atualiza status (PAID + paidAt) → limpa cache
```

### C — Disparar notificação
```
POST /api/notifications/trigger-overdue (array) → publica na fila (carimba tenantId) → 202
POST /api/notifications/trigger-overdue/:invoiceId → enfileira 1 fatura (reenvio manual)
```

### D — Processamento assíncrono → ver seção 6 (worker).

### E — Cobrança recorrente automática (cron)
```
cron 11:00 → POST /api/system/billing/run (x-cron-secret)
  → BillingScheduler: lista tenants ativos → 1 job/tenant na billing_scheduler_queue
  → billing.worker → SubscriptionService.run() → gera Invoice da competência (idempotente)
  → a fatura entra no ciclo normal (overdue → notificação → webhook → PAID)
```

---

## 8. Comunicações externas (integrações)

| Ator externo | Direção | Como |
|---|---|---|
| **Frontend (React)** | ↔ API | HTTPS, mesma origem (`/api`), JWT no header |
| **Cron do Linux (VM)** | → API | `/api/system/*` com `x-cron-secret` (fan-out cross-tenant) |
| **Gateway de pagamento** | → API | webhook `POST /api/invoices/webhook` (confirma pagamento) |
| **WhatsApp (Meta Cloud API)** | ← Worker | envio de mensagem (texto/template) por tenant |
| **E-mail (SMTP/SES/...)** | ← Worker | envio de cobrança por e-mail (seam pronto, provider a plugar) |
| **Pagador** | → App | páginas públicas `/r/:token` (Elo), `/pagar/:token`, `/portal/:token` |

---

## 9. Regras de negócio que amarram o fluxo

| Código | Regra |
|---|---|
| RN-T | Todo dado pertence a um `Account`; queries sempre filtram por `tenantId`. |
| RN-T3 | Telefone do cliente é único por tenant. |
| RN-T5 | `tenantId` carimbado no payload ao enfileirar. |
| RN-P2 | Toda cobrança passa pelo gateway na criação (guarda `gatewayId`). |
| RN-P3 | Webhook idempotente por `eventId`. |
| RN-P4 | Autenticidade do webhook é responsabilidade do provider ativo. |

**Estados da fatura:** `PENDING → PAID` · `→ OVERDUE` · `→ FAILED`
(máquina de estados `canTransitionInvoice`; `PAID` é terminal).
**Estados do cliente:** `EM_DIA` · `EM_ATRASO`.

---

## 10. Infraestrutura e deploy

- **Produção:** EC2 + Elastic IP, DNS em `useadimplo.com.br` (A: `@`, `www`, `api`).
- **Caddy:** único ponto de entrada (80/443), HTTPS automático (Let's Encrypt),
  serve o frontend estático (`/`) e faz proxy de `/api/*` → `api:3000`. API (3000)
  e painel RabbitMQ (15672) presos ao **loopback** (só 22/80/443 expostos).
- **Deploy:** `scripts/deploy.sh` (backend na VM: pull→build→migrate→recria→health
  →rollback) e `scripts/deploy-web.sh` (frontend: build local + scp).
- **Cron:** 11:00 billing+notificações; 03:00 backup (`pg_dump`, rotação 14).
- **Footprint:** ~1,3 GB de RAM (roda em free-tier de 1 GiB). Escala horizontal
  via mais workers (stateless + fila).

### Variáveis de ambiente principais
`DATABASE_URL`, `RABBITMQ_URL`, `JWT_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`
(obrigatórias) · `REDIS_ENABLED`/`REDIS_URL` · `WHATSAPP_PROVIDER` +
`WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` · `PAYMENT_PROVIDER` +
`INFINITEPAY_HANDLE`/`MP_ACCESS_TOKEN` · `EMAIL_PROVIDER` (provider real a plugar).

---

## 11. Observabilidade e dívidas conhecidas (transparência)

- Logs hoje via `console.log` (evoluir para pino) — PR-07.
- Sem Sentry/métricas ainda (DLQ crescendo = alarme de negócio) — PR-08.
- Backup só no disco da VM (falta off-site S3/R2) — D-19.
- Webhook InfinitePay a validar com doc oficial — D-18.
- E-mail real: provider SMTP pronto (falta conta + remetente verificado);
  template WhatsApp e renovação automática do SaaS — a plugar.

> Mapa completo de dívidas em `SDD/context/tech-debt.md`; roadmap comercial em
> `SDD/context/production-readiness.md`.
</content>
</invoke>
