# Playbook: Rodar e Depurar Localmente

## Pré-requisitos

Serviços de infraestrutura no ar (ver `context/tech-stack.md`):
- **PostgreSQL** (via `DATABASE_URL`)
- **RabbitMQ** (via `RABBITMQ_URL`)
- **Redis** (opcional, se `REDIS_ENABLED=true`)

Crie um `.env` na raiz (não existe `.env.example` ainda — dívida **D-11**):
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/billing"
RABBITMQ_URL="amqp://guest:guest@localhost:5672"
PORT=3000
REDIS_ENABLED=false
# REDIS_URL="redis://localhost:6379"   # se REDIS_ENABLED=true
```

## Subir infraestrutura rápido (Docker)

Não há `docker-compose.yml` no repo. Um atalho manual:
```bash
docker run -d --name pg   -e POSTGRES_PASSWORD=pass -e POSTGRES_USER=user -e POSTGRES_DB=billing -p 5432:5432 postgres:16
docker run -d --name rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
docker run -d --name redis  -p 6379:6379 redis:7   # opcional
```
Painel do RabbitMQ: http://localhost:15672 (guest/guest).

## Preparar o banco

```bash
npm install
npx prisma migrate deploy   # aplica migrations existentes
npx prisma generate         # garante o client
```

## Rodar a aplicação

```bash
npm run dev
```
`dev` roda `tsc -w` (watch) + `nodemon dist/server.js` em paralelo. A API sobe em `http://localhost:3000`.

### Modo do worker (D-03)
- **Monólito (default)**: a API também consome a fila. Basta `npm run dev`.
- **Worker isolado**: defina `RUN_WORKER_INLINE=false` no `.env` da API e rode o worker à parte com `npm run worker:dev` (dev) / `npm run worker` (build). Isso evita **consumidor duplicado** — não rode o worker isolado com a API em modo inline.

### Recriar a fila após mudança de topologia (D-04)
A fila `invoice_processing_queue` agora é declarada com `x-delivery-limit` + `x-dead-letter-exchange`. Se você já tinha a fila criada **sem** esses argumentos, o broker recusa a redeclaração (`PRECONDITION_FAILED`). Remova a fila uma vez:
- Painel RabbitMQ (http://localhost:15672) → Queues → `invoice_processing_queue` → Delete; ou
- CLI: `docker exec rabbit rabbitmqctl delete_queue invoice_processing_queue`

Na próxima subida a topologia (fila + DLX + DLQ) é recriada automaticamente.

### Mensagens "envenenadas" e a DLQ (D-04)
Erros no processamento fazem requeue **limitado**: após 5 entregas a mensagem vai para `invoice_processing_queue.dlq`. Para inspecionar mensagens paradas, olhe essa fila no painel do RabbitMQ.

### Migração de multi-tenancy (spec 0001)
Ao dar deploy da multi-tenancy, aplique a migração `prisma/migrations/20260701000000_multi_tenancy/migration.sql` **uma vez** — ela é idempotente e preserva os dados atuais atribuindo-os ao tenant default (`00000000-0000-0000-0000-000000000001`):
```bash
npx prisma migrate deploy        # se usa migrations; ou
psql "$DATABASE_URL" -f prisma/migrations/20260701000000_multi_tenancy/migration.sql   # manual
npx prisma generate              # atualiza o client
```
Depois, garanta `DEFAULT_TENANT_ID` no `.env` (default já aponta para o tenant seedado). O login passa a emitir JWT com `tenantId`; tokens antigos (sem tenant) recebem 401 — refaça o login.

### Migração do modelo de usuário (spec 0002)
Aplique também `prisma/migrations/20260701010000_user_model/migration.sql` (aditiva) — cria a tabela `User`. Depois use `POST /api/auth/register` para criar contas/usuários reais. `AUTH_USERNAME`/`AUTH_PASSWORD` viram opcionais (fallback de bootstrap).

### Migração do gateway de pagamento (spec 0003)
Aplique `prisma/migrations/20260701020000_payment_gateway/migration.sql` (aditiva) — adiciona `Invoice.checkoutUrl` e a tabela `WebhookEvent` (idempotência). Configure `PAYMENT_PROVIDER` (default `mock`); para o Mercado Pago, defina `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`/`MP_NOTIFICATION_URL`.

## Smoke test (fluxos principais)

As rotas internas exigem **JWT** (obtido no `/api/auth/login`); o webhook é verificado pelo **provider de pagamento** ativo (`mock`: `x-webhook-secret`; `mercadopago`: assinatura `x-signature`). `/health` é público.

```bash
# Health (público)
curl http://localhost:3000/health

# 0) (opcional) Cadastrar uma conta + usuário dono
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"accountName":"Acme","name":"Ana","email":"ana@acme.com","password":"segredo123"}'

# 1) Login → pega o token (usuário real por e-mail, ou a conta de serviço de bootstrap)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ana@acme.com","password":"segredo123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

# 2) Criar cliente (rota protegida por JWT)
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Fulano","phone":"11999999999","document":"12345678901"}'

# 3) Criar fatura (use o clientId retornado acima)
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":"<UUID>","value":150.00,"dueDate":"2026-07-10"}'

# 4) Listar faturas pendentes de inadimplentes
curl "http://localhost:3000/api/invoices/overdue?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# 5) Disparar cobrança por ID de fatura (enfileira)
curl -X POST http://localhost:3000/api/notifications/trigger-overdue/<INVOICE_ID> \
  -H "Authorization: Bearer $TOKEN"

# 6) Webhook de pagamento (provider MOCK: segredo, NÃO JWT — quem chama é o gateway)
#    inclua eventId para exercitar a idempotência (reenviar o mesmo → no-op)
curl -X POST http://localhost:3000/api/invoices/webhook \
  -H "Content-Type: application/json" -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -d '{"gatewayId":"<GATEWAY_ID>","status":"PAID","paidAt":"2026-07-01T12:00:00Z","eventId":"evt-123"}'

# 7) LGPD — exportar dados do titular (portabilidade)
curl "http://localhost:3000/api/lgpd/clients/<CLIENT_ID>/export" \
  -H "Authorization: Bearer $TOKEN"

# 8) LGPD — anonimizar o titular (mantém as faturas)
curl -X POST http://localhost:3000/api/lgpd/clients/<CLIENT_ID>/anonymize \
  -H "Authorization: Bearer $TOKEN"
```

> **Mercado Pago (sandbox)**: com `PAYMENT_PROVIDER=mercadopago` + `MP_ACCESS_TOKEN`, `POST /api/invoices` retorna um `checkoutUrl` (Checkout Pro: PIX/crédito/débito/boleto). Pague no sandbox; o MP chama `MP_NOTIFICATION_URL` (o webhook), que valida a assinatura, consulta o pagamento e atualiza a fatura. `MP_NOTIFICATION_URL` precisa ser pública (ex.: ngrok em dev).

## Onde olhar quando algo falha

| Sintoma | Provável causa | Onde checar |
|---|---|---|
| `RabbitMQ não conectado` | broker fora / `RABBITMQ_URL` errada | `rabbitmql.config.ts`, logs de bootstrap |
| Erro de conexão no boot | Postgres fora / `DATABASE_URL` | logs `⏳ Banco tentativa N` (retry) |
| Mensagem some sem processar | cliente não encontrado pelo telefone | `invoice.worker.ts` (ACK e descarta — RN-N3) |
| Mensagens indo parar na DLQ | erro determinístico esgotou as 5 tentativas | `invoice_processing_queue.dlq` no painel; corrija a causa e reenfileire |
| `PRECONDITION_FAILED` ao subir | fila antiga sem os novos argumentos | recrie a fila (ver seção acima) |
| Cache não funciona | `REDIS_ENABLED != true` ou Redis fora | `redis.config.ts` (fallback é normal) |
| `401 Token ausente/inválido` | falta `Authorization: Bearer` ou token expirado | refaça o login em `/api/auth/login` |
| `401 Assinatura do webhook inválida` | `x-webhook-secret` (mock) ou `x-signature` (MP) errado/ausente | confira `WEBHOOK_SECRET` / `MP_WEBHOOK_SECRET` |
| `500 Autenticação não configurada` | `JWT_SECRET`/`WEBHOOK_SECRET` ausentes no `.env` | configure os segredos (ver `.env.example`) |
| `Cannot find module ...` | import sem extensão `.js` | o arquivo que você editou |
| Mudou o código e não refletiu | `tsc` não recompilou / rodando `dist` antigo | confirme `npm run watch` ativo |

## Deploy (Docker Swarm / AWS)

O projeto tem `Dockerfile` (multi-stage, não-root, `tini`, healthcheck) e `docker-compose.yml` como **stack Swarm** (`postgres`, `rabbitmq`, `redis`, `migrate`, `api`, `worker`).

```bash
# 1) Build da imagem (push p/ ECR se o Swarm for multi-node)
docker build -t billing-api:latest .

# 2) Carregue as variáveis do .env (senhas/segredos — nunca ficam no compose)
set -a; . ./.env; set +a

# 3) Deploy da stack (o serviço `migrate` roda `prisma migrate deploy` e sai)
docker stack deploy -c docker-compose.yml billing

# 4) Acompanhe
docker service ls
docker service logs -f billing_api
```

### Free tier (1 instância, ~1 GiB) — `docker-compose.free.yml`
Para uma única EC2 free tier, use o compose **free** (Compose puro, 1 réplica de cada, memória enxuta, ordem garantida por `depends_on` — o `migrate` roda antes da API/worker):
```bash
set -a; . ./.env; set +a
docker compose -f docker-compose.free.yml up -d --build
docker compose -f docker-compose.free.yml ps
docker compose -f docker-compose.free.yml logs -f api
```
- Não precisa de Swarm nem `docker build` separado (o `--build` já builda).
- Adicione **swap** na instância (1 GiB é apertado) — ver Passo 4 do deploy.
- **Frontend**: o serviço `web` (nginx) já está previsto (comentado) — sirva o build em `frontend/dist`, descomente e ele serve o SPA + proxy `/api`. Ver `frontend/README.md`.

#### Atualizar a app na VM — `scripts/deploy.sh`
Depois do primeiro `up`, use o script para atualizar com **downtime mínimo e rollback automático**:
```bash
./scripts/deploy.sh              # git pull + build + migrate + recria api/worker
FORCE_BUILD=1 ./scripts/deploy.sh   # rebuild mesmo sem mudança de código
```
Ordem segura embutida: `git pull --ff-only` → **build da imagem nova com a antiga ainda no ar** → `migrate deploy` em container efêmero (**antes** de trocar a app) → recria só `api`+`worker` (`--no-deps --wait`) → health check → **rollback automático** para a imagem anterior se não ficar saudável. Nunca usa `-v` (não apaga dados).
- **Regra de ouro das migrations**: sejam **aditivas/compatíveis** (expand→contract), pois a app antiga continua no ar durante o `migrate deploy`.
- **Downtime**: com 1 réplica há um blip de segundos ao recriar a API. Zero-downtime real exige 2 réplicas atrás de um proxy (nginx) — ligar quando o serviço `web` entrar.

### Produção (multi-nó / Swarm)
Pontos importantes:
- **Segredos** vêm do `.env` (interpolado pelo compose): `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `JWT_SECRET`, `WEBHOOK_SECRET`, etc. O compose falha se faltarem.
- A `api` roda com `RUN_WORKER_INLINE=false`; o `worker` é serviço próprio (3 réplicas). **Não** há consumidor duplicado (D-03).
- **Migrações**: rode o serviço `migrate` (ou `docker service` one-off) **antes** de escalar `api`/`worker`. Em Swarm não há `depends_on`, então garanta a ordem (ex.: no pipeline de deploy).
- **Graceful shutdown** (PR-09): a app trata SIGTERM (fecha HTTP/RabbitMQ/Redis/Prisma); `tini` + `stop_grace_period: 30s` dão a janela.
- **Segurança**: para produção mais rígida, migrar as senhas para `docker secret` (requer ler de `/run/secrets` via entrypoint). Postgres/Redis não expõem portas externas; só a API (3000) e o painel do RabbitMQ (15672).

## Logs

O projeto loga bastante com emojis em português. Use-os como âncora: `🔌`/`✅` conexão, `📩` mensagem recebida, `❌` erro, `🧠 CACHE HIT` / `❌ CACHE MISS`.
