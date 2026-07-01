# Dívida Técnica & Backlog de Melhoria

Mapa vivo dos problemas conhecidos. Priorize por severidade. Ao resolver um item, mova-o para "Resolvidos" com o commit/PR.

Severidade: 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🔵 Baixo/Cosmético

---

## 🔴 Críticos

### D-02 · Integração WhatsApp não envia de verdade (seam pronto, provedor pendente)
- **O quê**: `src/apis/whatsapp.api.ts` foi refatorado (2026-07-01) de stub cru para um **seam** com contrato `WhatsappProvider` e provider padrão `LogOnlyWhatsappProvider` (só loga). Seleção por env `WHATSAPP_PROVIDER` (default `log`).
- **O que falta**: implementar um provider real (ex.: Meta Cloud API — há esqueleto comentado no arquivo — ou Twilio), registrar no `resolveProviderFromEnv()`, configurar credenciais e adicionar retry/tratamento de falha. Ver `skills/add-worker-consumer.md` para o padrão de retry.
- **Impacto atual**: cobranças ainda **não são entregues** — apenas logadas. Mas o hardcode saiu e plugar o provedor é isolado.

---

## 🟠 Altos

### D-05 · Sem autenticação/autorização
- **O quê**: Nenhum endpoint tem auth. Webhook `/api/invoices/webhook` é público e sem verificação de assinatura.
- **Impacto**: Qualquer um pode criar faturas, marcar como pagas, disparar cobranças em massa.
- **Ação**: Auth para rotas internas (API key/JWT) e verificação de assinatura/segredo no webhook.

### D-06 · Sem testes automatizados
- **O quê**: Não há testes nem script de teste. Nenhum de unidade, integração ou e2e.
- **Impacto**: Refatorar/adicionar features é arriscado; regressões silenciosas.
- **Ação**: Adicionar framework (vitest/jest), começar por services e repositories, e um smoke e2e dos fluxos A–D.

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

### D-11 · Sem `.env.example`
- **O quê**: Variáveis de ambiente não documentadas em arquivo de exemplo.
- **Impacto**: Onboarding difícil; erros de configuração.
- **Ação**: Criar `.env.example` com `DATABASE_URL`, `RABBITMQ_URL`, `PORT`, `REDIS_ENABLED`, `REDIS_URL`. (Ver `tech-stack.md`.)

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

_(mova novos itens para cá com data e referência do commit/PR quando concluídos)_
