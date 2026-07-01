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
| `cors` | ^2.8.6 | CORS middleware |
| `dotenv` | ^17.4.2 | Variáveis de ambiente |

## Dependências de desenvolvimento

| Pacote | Uso |
|---|---|
| `nodemon` | Reload do servidor em dev (`dist/server.js`) |
| `concurrently` | Roda `watch` + `serve` juntos |
| `tsx` | Execução direta de TS (disponível, não usado nos scripts atuais) |
| `@types/*` | Tipos de node, express, cors, pg |

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

> ⚠️ Ainda não há scripts de teste/lint. Ver `tech-debt.md`.

## Variáveis de ambiente

Carregadas via `dotenv` — `src/server.ts` e `src/worker.ts` fazem `import 'dotenv/config'` no topo.

| Variável | Obrigatória | Usada em | Descrição |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `schema.prisma` | String de conexão PostgreSQL |
| `RABBITMQ_URL` | ✅ | `rabbitmql.config.ts` | String de conexão AMQP |
| `PORT` | ➖ | `server.ts` | Porta HTTP (default `3000`) |
| `REDIS_ENABLED` | ➖ | `redis.config.ts` | `"true"` habilita o cache Redis |
| `REDIS_URL` | condicional | `redis.config.ts` | Necessária se `REDIS_ENABLED=true` |
| `WHATSAPP_PROVIDER` | ➖ | `whatsapp.api.ts` | Provider de envio. Default `log` (só loga, não envia). Futuros: `cloud`, `twilio` |

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
├── config/          · rabbitmql.config.ts, redis.config.ts
├── controllers/     · clients, invoice, notification, health
├── database/        · prisma.ts (client singleton)
├── dtos/            · validação/contratos (Zod + validação manual)
├── infrastructure/  · retry.ts
├── messaging/       · publish/ e consumer/
├── repositories/    · cliente, invoice, notification
├── routers/         · um router por domínio
├── services/        · regra de negócio por domínio
├── works/           · invoice.worker.ts
├── index.ts         · agregador de rotas (appRouter)
├── server.ts        · entrypoint da API (bootstrap)
└── worker.ts        · entrypoint do worker isolado

prisma/
├── schema.prisma
└── migrations/
```
