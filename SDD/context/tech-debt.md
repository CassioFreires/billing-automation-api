# Dívida Técnica & Backlog de Melhoria

Mapa vivo dos problemas conhecidos. Priorize por severidade. Ao resolver um item, mova-o para "Resolvidos" com o commit/PR.

Severidade: 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🔵 Baixo/Cosmético

> 📈 Para o roadmap de **produção e comercialização** (SaaS, multi-tenancy, LGPD, escala), ver [`production-readiness.md`](./production-readiness.md). Este arquivo cobre dívida de código; aquele cobre o caminho de negócio.

---

## 🔴 Críticos

_(nenhum item aberto no momento)_

---

## 🟠 Altos

### D-17 · Segredos por tenant em texto no banco — ✅ (WhatsApp) 2026-07-04
- **Feito**: `WhatsappSetting.token` agora é **cifrado em repouso** (AES-256-GCM, `src/infrastructure/crypto.ts`, chave `ENCRYPTION_KEY`). Cifra no `upsert`, decifra no `findByTenant`; formato versionado `enc:v1:`, **tolerante a legado** (tokens antigos em texto seguem legíveis e são recifrados no próximo save). Testado (`tests/unit/crypto.test.ts`).
- **Pendente**: quando o `PaymentSetting.mpAccessToken` (token do Mercado Pago) for de fato implementado/persistido, aplicar o **mesmo** `encryptSecret`/`decryptSecret`. O handle do InfinitePay é público (não precisa). Rotacionar tokens após onboarding real.

### D-02 · WhatsApp: falta suporte a *template* (texto/teste/janela 24h já enviam)
- **O quê**: `src/apis/whatsapp.api.ts` tem o **seam** (`WhatsappProvider`) e agora um provider real `CloudApiWhatsappProvider` (Meta Cloud API), selecionado por `WHATSAPP_PROVIDER=cloud`. Envia mensagem de **texto** e o worker re-tenta em falha (nack→DLQ). Testado (unit). Ver `whatsapp-integration.md`.
- **O que falta**: **mensagem de template** (`type: 'template'`), obrigatória pela Meta para cobrança iniciada por você **fora da janela de 24h**. Hoje o texto livre só entrega ao número de teste ou dentro da janela. Falta também consumir o webhook de status de entrega (sent/delivered/failed).
- **Impacto atual**: já dá para testar/demonstrar de graça (número de teste) e enviar na janela de 24h; disparo em massa business-initiated depende do template.

---

## 🟡 Médios

### D-18 · Webhook do InfinitePay não validado
- **O quê**: `src/apis/payment/infinitepay.gateway.ts` cria o checkout, mas o `verifyAndParseWebhook` (confirmação de pagamento) foi implementado **sem a doc oficial** do InfinitePay — está marcado "a validar".
- **Impacto**: a confirmação automática de pagamento via InfinitePay pode não funcionar até o contrato do webhook ser conferido com a documentação real.
- **Ação**: obter a doc oficial do InfinitePay, ajustar o parse/validação e fazer o teste real (spec 0011, item #8 do backlog).

### D-19 · Backup do banco só no disco da VM (sem off-site)
- **O quê**: `scripts/backup-db.sh` (cron 03:00) salva os dumps em `~/billing-backups` na própria EC2. Protege contra erro humano/corrupção, mas **não** contra perder a instância/disco.
- **Impacto**: perda total de dados se a VM/EBS morrer.
- **Ação**: copiar os dumps para o **S3** (`aws s3 cp`/lifecycle) — ~15 min. Ver [`devops-infra.md`](./devops-infra.md) §9.

### D-21 · `Client.debtValue` é um campo morto (sempre 0)
- **O quê**: a coluna `Client.debtValue` **nunca é escrita** no código (o único `debtValue` que aparece é um campo à parte do DTO de notificação). Ela fica sempre no default `0.0`.
- **Impacto**: enganosa — se o frontend exibir "dívida" a partir dela, mostra sempre R$ 0. Ocupa espaço e confunde quem lê o schema.
- **Ação** (decisão de produto): (a) **calcular** de verdade (soma das faturas em aberto do cliente, atualizada em transação ao criar/pagar fatura) — vira feature de dashboard; ou (b) **remover** a coluna. Não decidir por inércia.

### D-07 · `status` como String livre (sem enum) — 🟡 parcial 2026-07-04
- **Feito**: constantes centralizadas em `src/domain/status.ts` (`InvoiceStatus`/`ClientStatus`/`SubscriptionStatus`) + **máquina de estados** da fatura (`canTransitionInvoice`, ligada no webhook — `PAID` não regride). Testado.
- **Pendente**: converter as colunas `status` para **enum NATIVO do Postgres** (integridade no banco). Adiado por ter efeito cascata de tipos + cast de migração em runtime (não coberto pelos testes que mockam o banco) — fazer como PR próprio, verificável ponta a ponta. Adotar as constantes de `domain/status.ts` nos demais pontos que ainda usam string literal também fica para essa passada.

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

### D-20 · SSH (22) aberto para `0.0.0.0/0`
- **O quê**: a porta 22 no Security Group aceita conexões de qualquer IP (protegida por chave `.pem`, sem senha).
- **Impacto**: baixo (só com a chave se entra), mas aumenta a superfície de ataque/ruído de brute-force.
- **Ação**: restringir o *Source* da regra 22 ao seu IP fixo (ou usar SSM Session Manager). Ver [`devops-infra.md`](./devops-infra.md) §3/§10.

---

## Resolvidos

### Infra de produção: HTTPS, deploy, backup e hardening — ✅ 2026-07-03/04
- App no ar em `https://useadimplo.com.br` via **Caddy** (reverse proxy + Let's Encrypt automático); frontend servido na raiz + `/api` mesma origem; `api.useadimplo.com.br` para acesso direto.
- Deploy: `scripts/deploy.sh` (backend, inclui caddy) e `scripts/deploy-web.sh` (frontend, build local + scp). `.gitattributes` força LF em `*.sh`.
- Cron diário (billing + notificações) e **backup** (`scripts/backup-db.sh`, 03:00, rotação 14).
- Hardening: portas 3000/15672 presas ao loopback (SG só 22/80/443); `CRON_SECRET` e senha do Postgres **rotacionados**. Detalhes e conceitos em [`devops-infra.md`](./devops-infra.md).

### Features 0008–0014 (import CSV, assinaturas, InfinitePay, settings por tenant, scheduler cross-tenant) — ✅ 2026-07
- Documentadas nas specs `0008`–`0014` e refletidas em `overview.md`, `domain-model.md`, `architecture.md` e `fluxo-completo.md`.

### D-15 · Dados mockados de gateway/PIX espalhados — ✅ 2026-07-01
- Criação de cobrança centralizada no seam de gateway (`src/apis/payment/`). E o `invoice.worker.ts` deixou de **fabricar** PIX/gatewayId: agora busca a fatura real (`findNotificationDataById`), usa `checkoutUrl`/`pixCopyPaste` reais na mensagem e só marca `notificationSent` (`markNotificationSent`). Mensagem extraída em `buildChargeMessage` (função pura testada).

### PR-02/PR-03 · Gateway real (Mercado Pago) + idempotência do webhook — ✅ 2026-07-01
- Seam `src/apis/payment/` com provider selecionável (`PAYMENT_PROVIDER`): `mock` (default) e `mercadopago` (Checkout Pro real, sandbox). `InvoiceService.createPayment` usa o provider; webhook normalizado por `verifyAndParseWebhook` e aplicado idempotentemente (`WebhookEvent`). Ver spec 0003.
- **Follow-up**: mapear clientes ↔ payer do MP; hardening transacional da idempotência; worker usar dados reais da fatura (ver D-15).

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
- **Webhook** (`POST /api/invoices/webhook`): originalmente via middleware `webhookAuth` (`x-webhook-secret`). **Superado na spec 0003**: a verificação passou para o provider de pagamento (`mock` = `x-webhook-secret`; `mercadopago` = assinatura `x-signature`).
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
