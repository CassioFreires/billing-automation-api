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

## 2. 🔴 Concorrência, transações & idempotência

- [ ] **Cobrança recorrente pode duplicar cobrança no gateway.** Em `invoice.service.createForSubscription`, a idempotência é _check-then-create_: `findBySubscriptionPeriod` → `createCharge` (gateway) → `create`. Duas execuções concorrentes (ex.: cron + `/subscriptions/run` manual) passam pelo `find` juntas e **ambas chamam o gateway** antes do `@@unique([subscriptionId, period])` barrar o 2º insert → **duas cobranças criadas no InfinitePay**. 🔴 ⏳
  - Correção: **reservar primeiro** — inserir a `Invoice` (status `PENDING`, sem dados de gateway) dentro de uma transação que já topa no `@@unique`; só **depois** chamar `createCharge` e dar `update` com os dados. Em conflito de unique, aborta sem chamar o gateway.
- [ ] **Webhook: transação + guarda de ordem.** Em `invoice.service.applyWebhook`, `findByGatewayId` → `recordIfNew` → `updateStatus` não é transacional, e nada impede um evento **antigo** (`pending`) que chega **depois** sobrescrever um `PAID`. 🔴 ⏳
  - Envolver `recordIfNew` + `updateStatus` numa transação Prisma.
  - Não regredir status: se a fatura já está `PAID`, ignorar transição para `PENDING`/`FAILED` (ou usar timestamp do evento).
  - Conferir que `recordIfNew` usa `INSERT ... ON CONFLICT DO NOTHING` (atômico), não _select-then-insert_.
- [ ] **Cobrança avulsa órfã.** Em `createPayment`, se o `repository.create` falhar após `createCharge`, fica uma cobrança no gateway sem fatura. Mesmo padrão _reservar-depois-cobrar_ do item acima. 🟠 ⏳
- [ ] Se um dia rodar **N workers** consumindo a geração, usar `SELECT ... FOR UPDATE SKIP LOCKED` na varredura de assinaturas para dois workers não pegarem a mesma. Hoje é 1 job/tenant (serial), então é preventivo. 🔵 🗓️

## 3. 🟠 Idempotência & retry (resiliência)

- [ ] **Distinguir erro transitório de permanente no worker.** Hoje todo erro faz `nack(requeue)` até o `x-delivery-limit` → DLQ (bom), mas um erro permanente (ex.: telefone inválido) gasta 5 tentativas à toa. Classificar: transitório → requeue; permanente → DLQ direto. 🟠 ⏳
- [ ] **Retry com backoff no `createCharge`** (chamada de rede ao gateway). Já existe `infrastructure/retry.ts` para bootstrap — reusar para chamadas ao gateway/WhatsApp com jitter. 🟠 ⏱
- [ ] **Processo/rotina da DLQ**: hoje mensagens vão para a DLQ e ninguém olha. Criar um consumo/alerta (ou endpoint) para inspecionar e reprocessar. 🟠 ⏳
- [ ] **Chave de idempotência no `createCharge`** (enviar `reference`/idempotency-key ao gateway quando suportado) para o próprio gateway deduplicar. 🔵 ⏱

## 4. 🟠 Performance, queries & indexação

- [ ] **Índice para detecção de vencidos por data.** Hoje `Invoice` indexa `status` e `[tenantId, status]`, mas não `dueDate`. Se surgir uma query "faturas `PENDING` com `dueDate < hoje`", adicionar `@@index([tenantId, status, dueDate])`. 🟠 ⏱
- [ ] **Revisar N+1** nos endpoints de listagem (invoices/subscriptions que trazem cliente): usar `include`/`select` enxuto, não busca por item. 🟠 ⏱
- [ ] **Paginação por cursor** em vez de `offset/limit` nas listas que vão crescer (offset fica lento em tabelas grandes). 🔵 ⏳
- [ ] **`EXPLAIN ANALYZE`** nas 3 queries mais quentes (findPendingInvoices, listInvoices, varredura de assinaturas) com volume de teste (ex.: 100k faturas) e confirmar uso dos índices. 🟠 ⏳
- [ ] **Cache Redis** hoje só cobre `findPendingInvoices`. Avaliar cachear settings por tenant (payment/whatsapp) que o worker lê a cada mensagem. 🔵 ⏱
- [ ] `debtValue` no Client é um **dado derivado** (soma de faturas em aberto). Decidir: manter denormalizado (atualizar em transação) ou calcular sob demanda. Hoje pode divergir. 🟠 ⏳

## 5. 🟠 Estrutura de dados & enums

- [ ] **Enums no Prisma** para `status` de Client/Invoice/Subscription (hoje `String` livre — [D-07]). Garante integridade e autocompleta. 🟠 ⏳
- [ ] **Máquina de estados explícita** da fatura (função `canTransition(from, to)`) em vez de `update` solto — evita transições inválidas (liga com §2). 🟠 ⏳

## 6. 🔴 Segurança

- [ ] **Cifrar segredos por tenant em repouso** ([D-17]): `WhatsappSetting.token` e futuro `mpAccessToken`. `pgcrypto` ou cifra na app com chave em segredo gerenciado. 🔴 ⏳
- [ ] **Rate limiting** nos endpoints sensíveis (login, criação de cobrança, disparo de notificação) — anti-abuso e proteção de custo (PR-11). `express-rate-limit`. 🟠 ⏱
- [ ] **Headers de segurança**: adicionar `helmet` ao Express. 🔵 ⏱
- [ ] **Validação de webhook do InfinitePay** ([D-18]) com a doc oficial antes de confiar em confirmação automática. 🟠 ⏳
- [ ] **Restringir SSH (porta 22)** ao seu IP no Security Group ([D-20]). 🔵 ⏱
- [ ] **Rotacionar `JWT_SECRET`** e conferir que nenhum segredo real ficou em `.env.example`/git. 🟠 ⏱
- [ ] **Lockout/backoff no login** após N tentativas erradas. 🔵 ⏳

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
