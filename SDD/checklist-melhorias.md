# Checklist de melhorias — Adimplo

> Lista acionável para evoluir a aplicação (correção, performance, segurança,
> concorrência, transações, dados, resiliência, escala, backup, queries, features).
> Marque `- [x]` ao concluir. Itens que já eram dívida catalogada apontam para o
> ID em [`context/tech-debt.md`](./context/tech-debt.md). Cada item tem
> **impacto** (🔴 alto / 🟠 médio / 🔵 baixo) e **esforço** (⏱ rápido / ⏳ médio / 🗓️ longo).

---

## 🎯 Ordem sugerida para amanhã (do mais crítico ao mais legal)

1. Correção de dados: **dinheiro como `Decimal`** (§1) — é bug de correção, mexe no schema, faça com a cabeça fresca.
2. **Concorrência/transações** no pagamento e webhook (§2) — evita cobrança duplicada e status "voltando".
3. **Backup off-site (S3) + teste de restore** (§7) — rede de segurança antes de dado real.
4. **Testes** cobrindo o que você acabou de mexer (§8).
5. Depois, conforme o pique: performance/índices (§4), segurança (§6), features (§11).

> Regra de ouro: **um item por vez**, com teste antes de commitar. Não empilhe migration de schema com refactor de concorrência no mesmo PR.

---

## 1. ✅ Correção de dados — dinheiro NÃO pode ser `Float` (FEITO 2026-07-04)

- [x] **Trocar `Float` por `Decimal` nos campos monetários.** `schema.prisma`: `Invoice.value`, `Subscription.amount`, `Client.debtValue`, `InvoiceItem.unitPrice` agora `Decimal @db.Decimal(12,2)`. Migration `20260704000000_money_decimal` converte preservando dados.
  - [x] Soma de itens em `invoice.service.createPayment` usa `Prisma.Decimal` (`.plus`/`.times`), não `number`.
  - [x] Contrato da API mantido em `number`: middleware `serializeDecimal` converte `Decimal → number` na saída (frontend não muda). Testado (`tests/unit/serialize-decimal.test.ts`).
  - [x] Build limpo + 113 testes passando; doc `domain-model.md` (RN-I5) atualizada.
- [ ] **(pendente)** Helper `money.ts` centralizando arredondamento/moeda (2 casas, `ROUND_HALF_EVEN`) — opcional, para quando houver mais aritmética monetária.

## 2. ✅ Concorrência, transações & idempotência (FEITO 2026-07-04)

- [x] **Cobrança recorrente não duplica mais no gateway.** `createForSubscription` agora **reserva primeiro**: insere a `Invoice` (PENDING, sem gateway) → a `@@unique([subscriptionId, period])` barra corridas (cron + `/subscriptions/run`); só o vencedor chama `createCharge` e faz `attachCharge`. Perdedor cai no P2002, **não** chama o gateway e devolve a existente.
- [x] **Webhook atômico + guarda de ordem.** Novo `invoiceRepository.applyWebhookAtomic`: registra o evento (unique) **e** atualiza o status na **mesma transação** (`prisma.$transaction`); uma fatura já `PAID` **não regride** (guarda no service + backstop atômico dentro da tx). `recordIfNew`/insert usa a PK como trava (atômico).
- [x] **Cobrança avulsa sem órfã.** `createPayment` também reserva-depois-cobra; se o gateway falhar, `deleteById` desfaz a reserva (retry limpo).
- [x] Verificado: build limpo + 120 testes (reserva órfã, corrida P2002, falha-gateway, guarda de ordem).
- [ ] **(pendente/preventivo)** Se um dia rodar **N workers** na geração, usar `SELECT ... FOR UPDATE SKIP LOCKED` na varredura de assinaturas. Hoje é 1 job/tenant (serial). 🔵 🗓️

## 3. 🟠 Idempotência & retry (resiliência) — PARCIAL (2026-07-04)

- [x] **Distinguir erro transitório de permanente no worker.** `PermanentError` + `shouldRequeue` (`infrastructure/errors.ts`): payload malformado / sem `tenantId` → `nack` **sem requeue** (direto p/ DLQ, sem gastar reentregas); demais erros → requeue limitado pelo `x-delivery-limit`. Testado (`tests/unit/errors.test.ts`).
- [x] **Micro-bug do `retry.ts`**: não dormia mais após a última tentativa (lança na hora).
- [ ] **(bloqueado) Retry com backoff no `createCharge`.** ⚠️ Descoberta: o `createCharge` do **InfinitePay (default) é puro** (só monta URL, sem rede) → retry é inócuo. O do **Mercado Pago** faz rede, mas **retry sem chave de idempotência pode DUPLICAR cobrança**. Então este item depende do de baixo. 🟠
- [ ] **Chave de idempotência no `createCharge`** (enviar `reference`/`X-Idempotency-Key` ao gateway) — desbloqueia o retry seguro do MP. 🔵 ⏱
- [ ] **Rotina/observabilidade da DLQ.** Por ora dá para **inspecionar manualmente** pelo painel do RabbitMQ (túnel SSH → `http://localhost:15672` → fila `invoice_processing_queue.dlq`). Falta automatizar: alerta quando a DLQ cresce + endpoint/script de reprocessamento. 🟠 ⏳ (liga com observabilidade §10)

## 4. 🟠 Performance, queries & indexação — PARCIAL (2026-07-04)

- [x] **Índice `[tenantId, status, dueDate]`** na Invoice (migration `20260704120000`): serve o filtro (tenant+status) **+** a ordenação por `dueDate` da lista de pendentes, sem passo de sort.
- [x] **N+1 no `importUpsert` eliminado.** Era `findUnique` + `create/update` **por linha** (~2N queries). Agora: **1 `findMany`** batch + **1 `createMany`** + updates só para os existentes. Lógica de contagem/dedup extraída para `utils/import-plan.ts` (`planImport`, puro) e testada.
- [x] **N+1 nas listagens: conferido, não há.** `findAll`/`findById` usam `include: { client, items }` — o Prisma **batcheia** as relações (não é 1 query por linha). OK.
- [x] `debtValue` investigado → **campo morto** (nunca escrito, sempre 0). Registrado como **D-21** (calcular ou remover — decisão de produto).
- [ ] **(pendente) `EXPLAIN ANALYZE`** nas queries quentes (findPendingInvoices, listInvoices, varredura de assinaturas) **com volume** (ex.: 100k faturas) pra confirmar uso dos índices. Precisa de dados — fazer quando houver base de teste. 🟠 ⏳
- [ ] **(pendente) Paginação por cursor** onde crescer (offset fica lento em tabela grande). 🔵 ⏳
- [ ] **(pendente) Cachear settings por tenant** (payment/whatsapp) que o worker lê a cada mensagem. 🔵 ⏱

## 5. 🟠 Estrutura de dados & enums — PARCIAL (2026-07-04)

- [x] **Constantes de status centralizadas** (`src/domain/status.ts`): `InvoiceStatus`/`ClientStatus`/`SubscriptionStatus` (fim das magic strings dispersas — parte do [D-07]).
- [x] **Máquina de estados da fatura** (`canTransitionInvoice`): `PAID` é terminal (não regride), mesmo-status é no-op; ligada no webhook (service + backstop atômico no repo). Testada (`tests/unit/status.test.ts`).
- [ ] **(pendente/PR próprio) Enum NATIVO do Postgres** para os status ([D-07]/PR-15). Adiado de propósito: converter `status String` → enum tem **efeito cascata de tipos** em várias assinaturas e um **cast de migração** em runtime que os testes (que mockam o banco) não cobrem — merece um PR verificável ponta a ponta. 🟠 ⏳
- [ ] **(pendente) Máquina de estados p/ Subscription** (ACTIVE↔PAUSED→CANCELED) nos endpoints de pause/resume/cancel. 🔵 ⏱

## 6. 🔴 Segurança — PARCIAL (2026-07-04)

- [x] **Cifrar segredos por tenant em repouso** ([D-17]): `WhatsappSetting.token` cifrado com AES-256-GCM (`infrastructure/crypto.ts`, chave `ENCRYPTION_KEY`), tolerante a legado. Testado. Falta aplicar ao `mpAccessToken` quando ele for persistido.
- [x] **Rate limiting** (PR-11): `express-rate-limit` — limite geral folgado (120/min por IP) em toda a API + limite estrito (20/15min por IP) em `/auth` (login/registro). `app.set('trust proxy', 1)` para o `req.ip` ser o IP real por trás do Caddy.
- [x] **Headers de segurança**: `helmet()` no Express (HSTS, no-sniff, etc.).
- [ ] **Validação de webhook do InfinitePay** ([D-18]) com a doc oficial antes de confiar em confirmação automática. 🟠 ⏳
- [ ] **Restringir SSH (porta 22)** ao seu IP no Security Group ([D-20]). 🔵 ⏱ (infra)
- [ ] **Rotacionar `JWT_SECRET`** e conferir que nenhum segredo real ficou em `.env.example`/git. 🟠 ⏱ (ops)
- [ ] **Lockout/backoff no login** após N tentativas erradas (complementa o rate limit). 🔵 ⏳

## 7. 💾 Backup & estratégia (incl. "se lotar")

- [ ] **Backup off-site no S3** ([D-19]): `scripts/backup-db.sh` já gera o dump; adicionar `aws s3 cp` no fim e uma **lifecycle rule** no bucket (ex.: expira em 90 dias, move para Glacier depois de 30). 🔴 ⏳
- [ ] **Testar o restore** de verdade (num banco descartável) — backup não testado é backup que não existe. 🔴 ⏱
- [ ] **Proteção contra "encher o disco"**: a rotação já mantém 14 locais, mas adicionar (a) alerta de disco < 15% no cron; (b) `set -e` já aborta o dump se falhar; (c) mandar para S3 e manter só 3–5 locais. 🟠 ⏱
- [ ] **Monitorar sucesso do backup**: se o cron das 03:00 falhar, você precisa saber. Logar em arquivo (já faz) + um _healthcheck ping_ (ex.: healthchecks.io) que alarma se não rodar. 🟠 ⏱

## 8. 🧪 Testes

- [ ] **Testes de concorrência/idempotência** para os itens do §2 (dois `applyWebhook` no mesmo evento; duas `createForSubscription` no mesmo período). 🔴 ⏳
- [ ] **Testes de repositório com Postgres real** (testcontainers) — hoje os testes mockam o banco; escopo por tenant e unique constraints só se validam com DB de verdade (follow-up do D-06). 🟠 🗓️
- [ ] **Teste e2e** do fluxo recorrente: cron → fila → worker → fatura → (webhook) → PAID. 🟠 ⏳
- [ ] **Teste do gerador de competência** (`utils/recurrence.ts`) em bordas: dia 29–31, virada de ano, fuso. 🟠 ⏱
- [ ] Cobrir **CSV import** com linhas duplicadas/inválidas e limites (1–1000). 🔵 ⏱

## 9. 📈 Escalabilidade

- [ ] Documentar/validar rodar **N workers** (`RUN_WORKER_INLINE=false` já em prod) e o item de lock do §2. 🔵 ⏳
- [ ] **PgBouncer** quando houver múltiplas réplicas (PR-14). 🔵 🗓️
- [ ] Métrica de **profundidade da fila** (DLQ crescendo = alarme de negócio) — liga com observabilidade (PR-08). 🟠 ⏳

## 10. 🔭 Observabilidade (base para tudo acima)

- [ ] **Logger estruturado** (`pino`) com nível + correlação de request no lugar de `console.log` (PR-07). 🟠 ⏳
- [ ] **Sentry** para erros + métricas básicas (PR-08). 🟠 ⏳
- [ ] **`/api/health` mais rico**: checar banco/fila/redis, não só "up". 🔵 ⏱

## 11. ✨ Features que viram diferencial

- [ ] **Régua de cobrança configurável** (a promessa do Adimplo!): múltiplos lembretes por fatura — ex.: 3 dias antes, no dia, 3/7/15 dias depois — cada um com mensagem própria. Hoje o disparo é único. 🔴 🗓️ **(maior diferencial)**
- [ ] **Reconciliação automática**: baixa da fatura 100% pelo webhook, com painel de "pagas hoje" e conciliação. 🟠 ⏳
- [ ] **Link de pagamento reutilizável + página de fatura hospedada** (o cliente abre um link bonito com PIX/cartão). 🟠 🗓️
- [ ] **Dashboard de indicadores**: inadimplência %, valor a receber, recuperado no mês, DSO. 🟠 ⏳
- [ ] **Notificação multicanal**: além de WhatsApp, e-mail (barato) e SMS como fallback. 🔵 🗓️
- [ ] **Portal do cliente (devedor)**: link para ver o que deve e pagar, sem login. 🔵 🗓️
- [ ] **Webhooks de saída** para o cliente do Adimplo integrar no ERP dele (fatura paga → dispara evento). 🔵 🗓️
- [ ] **Planos/limites do SaaS** (PR-16): cobrar seus próprios clientes por volume — o Adimplo cobrando com o Adimplo. 🟠 🗓️
- [ ] **Templates de WhatsApp aprovados** (Meta) para cobrança fora da janela de 24h ([D-02]). 🔴 ⏳ (destrava cobrança em massa real)

---

## Referências
- Dívidas catalogadas: [`context/tech-debt.md`](./context/tech-debt.md)
- Roadmap de produção: [`context/production-readiness.md`](./context/production-readiness.md)
- Infra/DevOps e conceitos: [`context/devops-infra.md`](./context/devops-infra.md)
- Como implementar (playbooks): [`skills/`](./skills/) · nova feature → escreva a spec a partir de `specs/_TEMPLATE.md`
