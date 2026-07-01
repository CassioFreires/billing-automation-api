# Tech Stack

## Runtime e linguagem

| Item | Versão / Config | Notas |
|---|---|---|
| Node.js | ESM (`"type": "module"`) | Imports usam extensão `.js` mesmo em arquivos `.ts` (exigência do NodeNext) |
| TypeScript | ^6.0.3 | `target ES2022`, `module NodeNext`, `strict: true` |
| Build | `tsc` | `rootDir: "."`, `outDir: "./dist"` |

## Dependências de produção

| Pacote | Versão | Uso |
|---|---|---|
| `express` | ^5.2.1 | Framework HTTP (Express **5** — atenção a mudanças de API vs 4) |
| `@prisma/client` / `prisma` | ^6.19.3 | ORM + migrations, PostgreSQL |
| `amqplib` | ^2.0.1 | Cliente RabbitMQ |
| `redis` | ^6.0.0 | Cache (node-redis v4+) |
| `zod` | ^4.4.3 | Validação de schema/DTO |
| `jsonwebtoken` | ^9.0.3 | Emissão/verificação de JWT (auth) |
| `bcryptjs` | ^3.0.3 | Hash de senha (JS puro, sem build nativo) |
| `cors` | ^2.8.6 | CORS middleware |
| `dotenv` | ^17.4.2 | Variáveis de ambiente |

## Dependências de desenvolvimento

| Pacote | Uso |
|---|---|
| `nodemon` | Reload do servidor em dev (`dist/server.js`) |
| `concurrently` | Roda `watch` + `serve` juntos |
| `tsx` | Execução direta de TS (disponível, não usado nos scripts atuais) |
| `vitest` | Framework de testes (ESM/TS nativo). Ver `skills/testing.md` |
| `@types/*` | Tipos de node, express, cors, pg, jsonwebtoken |

## Scripts npm

`tsconfig`: `rootDir: "src"`, `outDir: "dist"` → cada `src/x.ts` vira `dist/x.js` (sem prefixo `dist/src/`). `dist/` é puro artefato de build (gitignored).

| Script | Comando | O que faz |
|---|---|---|
| `build` | `tsc` | Compila `src/` → `dist/` |
| `watch` | `tsc -w` | Recompila em watch |
| `serve` | `nodemon dist/server.js` | Sobe a API a partir do build |
| `dev` | `concurrently "npm run watch" "npm run serve"` | Dev da API (watch + serve) |
| `worker` | `node dist/worker.js` | Sobe o worker isolado |
| `worker:dev` | `concurrently "npm run watch" "nodemon dist/worker.js"` | Dev do worker isolado |
| `start` | `node dist/server.js` | Executa a API (produção) |
| `test` | `vitest run` | Roda a suíte de testes uma vez |
| `test:watch` | `vitest` | Testes em watch |

> ⚠️ Ainda não há script de lint. Ver `tech-debt.md`.

## Variáveis de ambiente

Carregadas via `dotenv` — `src/server.ts` e `src/worker.ts` fazem `import 'dotenv/config'` no topo.

| Variável | Obrigatória | Usada em | Descrição |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `schema.prisma` | String de conexão PostgreSQL |
| `RABBITMQ_URL` | ✅ | `rabbitmql.config.ts` | String de conexão AMQP |
| `PORT` | ➖ | `server.ts` | Porta HTTP (default `3000`) |
| `RUN_WORKER_INLINE` | ➖ | `server.ts` | `"false"` faz a API **não** consumir a fila (use com worker isolado). Default: consome inline |
| `REDIS_ENABLED` | ➖ | `redis.config.ts` | `"true"` habilita o cache Redis |
| `REDIS_URL` | condicional | `redis.config.ts` | Necessária se `REDIS_ENABLED=true` |
| `WHATSAPP_PROVIDER` | ➖ | `whatsapp.api.ts` | Provider de envio. Default `log` (só loga, não envia). Futuros: `cloud`, `twilio` |
| `JWT_SECRET` | ✅ | `auth.config.ts` | Segredo para assinar/verificar o JWT. Sem ele, rotas internas retornam 500 |
| `JWT_EXPIRES_IN` | ➖ | `auth.config.ts` | Validade do token (default `1h`) |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | ✅ | `auth.service.ts` | Credenciais da conta de serviço para o login |
| `WEBHOOK_SECRET` | ✅ | `webhook.middleware.ts` | Segredo esperado em `x-webhook-secret` no webhook |
| `DEFAULT_TENANT_ID` | ➖ | `auth.config.ts` | Tenant da conta de serviço (default = Account seedado na migração 0001) |

> ⚠️ Não existe `.env.example` no repositório. Recomenda-se criar um (ver `tech-debt.md`).

## Infraestrutura externa necessária

Para rodar localmente você precisa de:
- **PostgreSQL** acessível via `DATABASE_URL`.
- **RabbitMQ** acessível via `RABBITMQ_URL`.
- **Redis** (opcional) se `REDIS_ENABLED=true`.

Ver `skills/run-and-debug.md` para o passo a passo.

## Estrutura de pastas (fonte)

```
src/
├── apis/            · integrações externas (whatsapp.api.ts — stub)
├── config/          · rabbitmql.config.ts, redis.config.ts, auth.config.ts
├── context/         · tenant-context.ts (AsyncLocalStorage do tenant)
├── controllers/     · auth, clients, invoice, notification, health
├── database/        · prisma.ts (client singleton)
├── dtos/            · validação/contratos (Zod + validação manual)
├── infrastructure/  · retry.ts
├── messaging/       · invoice-queue.ts (topologia), publish/ e consumer/
├── middlewares/     · auth.middleware.ts (jwtAuth), webhook.middleware.ts
├── repositories/    · cliente, invoice, user
├── routers/         · um router por domínio (auth, clients, invoice, notification, health)
├── services/        · regra de negócio por domínio (inclui auth)
├── works/           · invoice.worker.ts
├── index.ts         · agregador de rotas (appRouter)
├── server.ts        · entrypoint da API (bootstrap)
└── worker.ts        · entrypoint do worker isolado

tests/unit/          · testes de services, auth e DTOs (Vitest)
vitest.config.ts     · configuração do Vitest (include tests/**/*.test.ts)

prisma/
├── schema.prisma
└── migrations/
```
