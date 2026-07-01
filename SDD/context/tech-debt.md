# Dívida Técnica & Backlog de Melhoria

Mapa vivo dos problemas conhecidos. Priorize por severidade. Ao resolver um item, mova-o para "Resolvidos" com o commit/PR.

Severidade: 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🔵 Baixo/Cosmético

> 📈 Para o roadmap de **produção e comercialização** (SaaS, multi-tenancy, LGPD, escala), ver [`production-readiness.md`](./production-readiness.md). Este arquivo cobre dívida de código; aquele cobre o caminho de negócio.

---

## 🔴 Críticos

### D-02 · Integração WhatsApp não envia de verdade (seam pronto, provedor pendente)
- **O quê**: `src/apis/whatsapp.api.ts` foi refatorado (2026-07-01) de stub cru para um **seam** com contrato `WhatsappProvider` e provider padrão `LogOnlyWhatsappProvider` (só loga). Seleção por env `WHATSAPP_PROVIDER` (default `log`).
- **O que falta**: implementar um provider real (ex.: Meta Cloud API — há esqueleto comentado no arquivo — ou Twilio), registrar no `resolveProviderFromEnv()`, configurar credenciais e adicionar retry/tratamento de falha. Ver `skills/add-worker-consumer.md` para o padrão de retry.
- **Impacto atual**: cobranças ainda **não são entregues** — apenas logadas. Mas o hardcode saiu e plugar o provedor é isolado.

---

## 🟠 Altos

_(nenhum item aberto no momento)_

---

## 🟡 Médios

### D-07 · `status` como String livre (sem enum)
- **O quê**: `Client.status` e `Invoice.status` são `String` no Prisma. Valores válidos só existem informalmente / no Zod do webhook.
- **Impacto**: Possíveis valores inválidos gravados; sem garantia de integridade.
- **Ação**: Usar `enum` no Prisma (ou tabela de referência) e centralizar constantes em um único lugar.

### D-08 · Validação inconsistente (Zod vs manual)
- **O quê**: `triggerNotification.dto.ts` valida manualmente com `if/throw` (e tem `console.log(payload)` esquecido); os demais usam Zod.
- **Impacto**: Divergência de padrão, mensagens inconsistentes, log ruidoso.
- **Ação**: Migrar `triggerNotification` para Zod; remover `console.log`. Ver `conventions.md`.

### D-10 · `consumer.messaging.ts` é template morto
- **O quê**: Consome `task_queue` genérica; não é usado pelo fluxo real (que usa `invoice_processing_queue`).
- **Impacto**: Confunde quem lê; código morto.
- **Ação**: Remover ou transformar em utilitário genérico de consumo parametrizável.

---

## 🔵 Baixos / Cosméticos

### D-13 · Nomes de arquivo com grafia inconsistente
- `notication.service.ts` → `notification.service.ts`
- `cliente.repositorie.ts` → `client.repository.ts`
- `rabbitmql.config.ts` → `rabbitmq.config.ts`
- **Ação**: Renomear com cuidado (atualizar todos os imports `.js`). Fazer isoladamente para revisão limpa.

### D-14 · Health check duplicado
- `GET /health` (no server) e `GET /api/health` (router). Definir um canônico.

### D-15 · Dados mockados de gateway/PIX espalhados
- `invoice.service.ts` e `invoice.worker.ts` geram `gatewayId`/PIX fake de formas diferentes.
- **Ação**: Centralizar num serviço de gateway (que depois vira integração real).

---

## Resolvidos

### D-01 · Fontes `server.ts` e `index.ts` ausentes — ✅ 2026-07-01
- Recriados `src/server.ts` (bootstrap) e `src/index.ts` (agregador `appRouter`) como fontes TypeScript, com `import 'dotenv/config'` explícito.
- `tsconfig.json`: `rootDir` passou de `.` para `src` + `include: ["src/**/*"]`. Build agora sai limpo em `dist/` (sem prefixo `dist/src/`); `dist/` é 100% artefato de build.
- `package.json`: `main` → `dist/server.js`; adicionados `start`, `worker` e `worker:dev`.

### D-12 · Sem script para subir só o worker — ✅ 2026-07-01
- Adicionados `worker` (`node dist/worker.js`) e `worker:dev` ao `package.json` junto com a correção do D-01.

### D-09 · `notification.repository.ts` vazio — ✅ 2026-07-01
- Arquivo vazio removido (a lógica de notificação usa `InvoiceRepository.findNotificationDataById`). Se um repositório próprio for necessário no futuro, criar já com conteúdo.

### D-03 · Worker rodava em dois lugares — ✅ 2026-07-01
- Worker inline na API virou **opt-in** via `RUN_WORKER_INLINE` (default: inline ligado). Para topologia com worker isolado (`npm run worker`), setar `RUN_WORKER_INLINE=false` na API → um único consumidor. Topologia da fila passou a ser declarada no startup (`assertInvoiceQueueTopology`), independente do modo.

### D-04 · Requeue infinito em erro permanente — ✅ 2026-07-01
- Topologia centralizada em `src/messaging/invoice-queue.ts`: fila principal quorum com `x-delivery-limit = 5` + `x-dead-letter-exchange` → após 5 reentregas a mensagem vai para a DLQ `invoice_processing_queue.dlq` (via DLX `invoice_processing_dlx`), sem loop infinito. Worker loga a contagem de entregas.
- ⚠️ Migração operacional: a fila `invoice_processing_queue` que já existia SEM esses argumentos precisa ser removida uma vez (o broker recusa redeclaração com args diferentes). Ver `skills/run-and-debug.md`.
- Follow-up: distinguir erro transitório de permanente (hoje todo erro faz requeue até o limite) fica para uma iteração futura.

### D-05 · Sem autenticação/autorização — ✅ 2026-07-01
- **JWT (Bearer)** nas rotas internas: `POST /api/auth/login` (público) valida uma conta de serviço (`AUTH_USERNAME`/`AUTH_PASSWORD`) e emite um JWT assinado com `JWT_SECRET`. Middleware `jwtAuth` protege `/clients`, `/notifications` e `/invoices` (create/overdue).
- **Webhook** (`POST /api/invoices/webhook`): middleware `webhookAuth` valida `x-webhook-secret` contra `WEBHOOK_SECRET` (comparação em tempo constante), estruturado para evoluir para HMAC.
- `/health` e `/auth/login` seguem públicos. Middlewares falham fechado se os segredos não estiverem configurados.
- Verificado por smoke test de runtime (login, JWT válido/ inválido, webhook ok/negado).
- **Follow-up (novo)**: hoje é uma conta de serviço única via env. Um modelo de usuário no banco (com hash de senha, papéis) é uma feature futura — escrever spec em `SDD/specs/` quando priorizado. Ver **D-16**.

### D-11 · Sem `.env.example` — ✅ 2026-07-01
- `.env.example` atualizado com todas as variáveis: API/worker, banco, RabbitMQ, Redis, WhatsApp, JWT e webhook.

### D-06 · Sem testes automatizados — ✅ 2026-07-01
- **Vitest** configurado (`vitest.config.ts`, scripts `test`/`test:watch`). Testes em `tests/unit/` cobrindo services (Client/Invoice/Notification, com repositórios mockados), auth (service + middlewares `jwtAuth`/`webhookAuth`), tenant-context e validação de DTOs (Zod). Rodam sem infra (DB/RabbitMQ mockados/dispensados).
- **Follow-up**: faltam testes de **repositório** (precisam de Postgres de teste / testcontainers) e **e2e** dos fluxos A–D com a app de pé. Ver `skills/testing.md`.

### D-16 · Auth por conta de serviço única — ✅ 2026-07-01
- Implementado modelo `User` real (spec 0002): signup (`POST /api/auth/register`) cria Account + usuário dono; login por e-mail/senha com hash `bcryptjs`. JWT carrega `sub`/`tenantId`/`role`.
- A conta de serviço via env permanece como **fallback de bootstrap** (`AUTH_USERNAME`/`AUTH_PASSWORD` agora opcionais) — remover quando houver usuários reais em produção.
- **Follow-up**: verificação de e-mail, reset de senha, convite de múltiplos usuários por conta, RBAC granular.

_(mova novos itens para cá com data e referência do commit/PR quando concluídos)_
