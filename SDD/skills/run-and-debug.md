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

> Observação (dívida **D-03**): o `server.ts` **também inicia o worker** no mesmo processo. Para rodar o worker isolado, use `npm run worker:dev` (dev) ou `npm run worker` (a partir de um build). Enquanto o worker sobe junto da API, evite rodar os dois ao mesmo tempo para não ter consumidores duplicados.

## Smoke test (fluxos principais)

```bash
# Health
curl http://localhost:3000/health

# Criar cliente
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -d '{"name":"Fulano","phone":"11999999999","document":"12345678901"}'

# Criar fatura (use o clientId retornado acima)
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<UUID>","value":150.00,"dueDate":"2026-07-10"}'

# Listar faturas pendentes de inadimplentes
curl "http://localhost:3000/api/invoices/overdue?page=1&limit=10"

# Disparar cobrança por ID de fatura (enfileira)
curl -X POST http://localhost:3000/api/notifications/trigger-overdue/<INVOICE_ID>

# Webhook de pagamento (use o gatewayId da fatura)
curl -X POST http://localhost:3000/api/invoices/webhook \
  -H "Content-Type: application/json" \
  -d '{"gatewayId":"<GATEWAY_ID>","status":"PAID","paidAt":"2026-07-01T12:00:00Z"}'
```

## Onde olhar quando algo falha

| Sintoma | Provável causa | Onde checar |
|---|---|---|
| `RabbitMQ não conectado` | broker fora / `RABBITMQ_URL` errada | `rabbitmql.config.ts`, logs de bootstrap |
| Erro de conexão no boot | Postgres fora / `DATABASE_URL` | logs `⏳ Banco tentativa N` (retry) |
| Mensagem some sem processar | cliente não encontrado pelo telefone | `invoice.worker.ts` (ACK e descarta — RN-N3) |
| Fila cresce e reprocessa em loop | erro permanente + requeue | dívida **D-04**, `invoice.worker.ts` |
| Cache não funciona | `REDIS_ENABLED != true` ou Redis fora | `redis.config.ts` (fallback é normal) |
| `Cannot find module ...` | import sem extensão `.js` | o arquivo que você editou |
| Mudou o código e não refletiu | `tsc` não recompilou / rodando `dist` antigo | confirme `npm run watch` ativo |

## Logs

O projeto loga bastante com emojis em português. Use-os como âncora: `🔌`/`✅` conexão, `📩` mensagem recebida, `❌` erro, `🧠 CACHE HIT` / `❌ CACHE MISS`.
