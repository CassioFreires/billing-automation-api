# CLAUDE.md

Guia para agentes de IA e devs trabalhando neste repositório.

## Comece pela pasta `SDD/`

Este projeto usa **Spec-Driven Development**. A base de conhecimento e os playbooks estão em [`SDD/`](./SDD/README.md). **Leia antes de codar.**

- **Entender o sistema** → `SDD/context/` (`overview` → `architecture` → `domain-model` → `tech-stack` → `conventions`)
- **Problemas conhecidos / backlog** → `SDD/context/tech-debt.md`
- **Como fazer algo** → `SDD/skills/` (add-feature, add-endpoint, add-worker-consumer, db-migration, run-and-debug, testing)
- **Nova feature** → escreva a spec a partir de `SDD/specs/_TEMPLATE.md` antes de implementar

## TL;DR do projeto

API de automação de cobrança: Node + Express 5 (ESM/TypeScript) · Prisma + PostgreSQL · RabbitMQ (fila de notificações) · Redis (cache opcional). Arquitetura em camadas `router → controller → service → repository → prisma`, com worker assíncrono consumindo `invoice_processing_queue` para enviar cobranças por WhatsApp.

## Regras de ouro (ver `SDD/context/conventions.md`)

1. **Imports internos usam extensão `.js`** mesmo em arquivos `.ts` (ESM/NodeNext). Erro mais comum do projeto.
2. Regra de negócio no **service**; acesso a banco só no **repository**; controller só traduz HTTP.
3. Validação com **Zod** em DTOs.
4. Ao mudar comportamento, **atualize o contexto em `SDD/`** no mesmo PR.

## Build & run

```bash
npm run dev      # tsc -w + nodemon dist/server.js
npm run build    # tsc → dist/
```
Passo a passo completo (infra, .env, smoke tests): `SDD/skills/run-and-debug.md`.

## Avisos importantes

- `dist/` é **puro artefato de build** (gitignored). Fonte é sempre `src/`. `tsconfig` usa `rootDir: "src"`, então `src/x.ts` → `dist/x.js`.
- Entrypoints: `src/server.ts` (API, sobe também o worker) e `src/worker.ts` (worker isolado). Agregador de rotas: `src/index.ts`.
- ⚠️ WhatsApp: há um **seam** (`src/apis/whatsapp.api.ts`) com contrato de provider, mas o padrão é `log-only` — **ainda não envia de verdade** (dívida **D-02**; falta plugar Meta/Twilio via `WHATSAPP_PROVIDER`).
