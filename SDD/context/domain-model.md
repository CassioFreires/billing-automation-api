# Modelo de Domínio

Fonte da verdade dos dados: `prisma/schema.prisma`. Fonte da verdade das **regras**: este documento.

## Entidades

### Account (Tenant / Conta do SaaS)

Conta contratante. **Todo dado de negócio pertence a um Account** (multi-tenancy — ver `../specs/0001-multi-tenancy.md`).

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK. Tenant "default" seedado: `00000000-0000-0000-0000-000000000001` |
| `name` | String | — | Nome da conta |
| `status` | String | `ACTIVE` | `ACTIVE`, `SUSPENDED` |
| `createdAt` | DateTime | `now()` | — |
| `acceptedTermsAt` | DateTime? | — | Prova de aceite dos Termos/Política no cadastro (spec 0022) |
| `acceptedTermsVersion` | String? | — | Versão do texto legal aceita (`LEGAL_VERSION`) — spec 0022 |
| `clients` / `invoices` / `users` | relações | — | 1-N |

**Direitos do titular do SaaS (spec 0022):** o dono pode **exportar** os dados da própria
conta (`GET /api/lgpd/account/export`) e **encerrá-la** (`POST /api/lgpd/account/delete`,
exige o nome exato como confirmação — remove o tenant em cascata).

### User (Usuário)

Usuário que loga na plataforma, vinculado a um `Account` (ver `../specs/0002-user-model-signup.md`).

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `email` | String | — | **Único global** (identificador de login) |
| `passwordHash` | String | — | Hash `bcryptjs` (nunca texto puro) |
| `name` | String | — | — |
| `role` | String | `OWNER` | `OWNER`, `ADMIN`, `MEMBER` (papéis por tenant — spec 0030) |
| `createdAt` | DateTime | `now()` | — |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`) |

Índices: `@@index([tenantId])`, `email @unique`.

### WebhookEvent (Idempotência)

Guarda os ids de evento de webhook já processados (spec 0003).

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String | — | PK = id do evento do provider (chave de idempotência) |
| `provider` | String | — | Origem (ex.: `gateway`) |
| `receivedAt` | DateTime | `now()` | — |

### Client (Cliente)

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `name` | String | — | Mín. 3 caracteres (validação no DTO) |
| `phone` | String | — | **Único por tenant** (`@@unique([tenantId, phone])`). Mín. 10 dígitos. Chave de busca do worker |
| `document` | String | — | CPF/CNPJ. Mín. 11 caracteres |
| `status` | String | `EM_DIA` | Estado de adimplência (ver máquina de estados) |
| `debtValue` | Decimal(12,2) | `0.0` | Valor total em dívida (dinheiro é `Decimal`, nunca `Float`) |
| `processed` | Boolean | `false` | Flag de processamento |
| `anonymizedAt` | DateTime? | — | LGPD: quando o titular foi anonimizado (spec 0004) |
| `lastUpdate` | DateTime | `@updatedAt` | Atualizado automaticamente |
| `createdAt` | DateTime | `now()` | — |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`). Escopo obrigatório |
| `invoices` | Invoice[] | — | Relação 1-N |

Índices: `@@unique([tenantId, phone])`, `@@index([status])`, `@@index([tenantId, status])`.

### Invoice (Fatura)

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `value` | Decimal(12,2) | — | Valor da cobrança (> 0). `Decimal` exato — a API converte para `number` na saída (middleware `serializeDecimal`) |
| `status` | String | `PENDING` | Ver máquina de estados |
| `pixCopyPaste` | String? | — | "Copia e cola" do PIX gerado pelo gateway |
| `pixQrCode` | String? | — | Link/Base64 do QR Code |
| `checkoutUrl` | String? | — | URL de checkout hospedado (ex.: Mercado Pago Checkout Pro) |
| `gatewayId` | String? | — | **Único**. Localizador da cobrança no gateway (para o MP, nosso `external_reference`) |
| `linkToken` | String? | — | **Único**. Token do **link próprio do Adimplo** (`/r/:token`) — Fundação "Elo" (spec 0016). Gerado na criação; resolvido globalmente (como `gatewayId`) |
| `dueDate` | DateTime | — | Vencimento |
| `paidAt` | DateTime? | — | Preenchido pelo webhook ao confirmar pagamento |
| `createdAt` | DateTime | `now()` | — |
| `notificationSent` | Boolean | `false` | `true` após o worker enviar a cobrança |
| `subscriptionId` | String? | — | FK → Subscription. Preenchido quando a fatura foi **gerada por uma assinatura** (spec 0009) |
| `period` | String? | — | Competência da assinatura (ex.: `2026-07`). Junto com `subscriptionId` garante idempotência |
| `clientId` | String | — | FK → Client (`onDelete: Cascade`) |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`). Escopo obrigatório |

Índices: `@@index([clientId])`, `@@index([status])`, `@@index([status, clientId])`, `@@index([tenantId, status])`, `@@index([tenantId, clientId])`, `@@index([tenantId, status, dueDate])` (filtro + ordenação da lista de pendentes), `@@unique([subscriptionId, period])` (uma fatura por competência por assinatura).

### Subscription (Assinatura / mensalidade) — spec 0009

Molde recorrente: gera uma `Invoice` por competência (mês) para um cliente.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `clientId` | String | — | FK → Client (`onDelete: Cascade`) |
| `amount` | Decimal(12,2) | — | Valor da mensalidade (> 0) |
| `dayOfMonth` | Int | — | Dia de vencimento (1–28) |
| `status` | String | `ACTIVE` | `ACTIVE`, `PAUSED`, `CANCELED` |
| `startDate` | DateTime | — | A partir de quando gera |
| `description` | String? | — | Aparece na cobrança |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`) |
| `createdAt` | DateTime | `now()` | — |

### PaymentSetting (Config de pagamento por tenant) — spec 0012

Uma linha por tenant. Diz **em qual conta** o tenant recebe.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `tenantId` | String | — | PK/único — 1 por tenant |
| `provider` | String | `infinitepay` | `infinitepay`, `mercadopago` ou `mock` |
| `infinitepayHandle` | String? | — | Handle público que recebe (ex.: `@loja`) |
| `redirectUrl` | String? | — | Retorno pós-checkout |
| `mpAccessToken` | String? | — | Token MP (**segredo** — mascarado na API, texto no banco por ora) |

### ReguaSetting (Régua de cobrança por tenant) — spec 0026

Uma linha por tenant. Sequência de lembretes automáticos.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `tenantId` | String | — | PK/único — 1 por tenant |
| `enabled` | Boolean | `false` | Liga a régua (desligada = modo simples legado) |
| `steps` | Json | `[]` | `[{ offsetDays, message? }]` ordenado por offset crescente |

Rastreio por fatura: `Invoice.reminderStep` (passos já enviados) e `Invoice.lastReminderAt`.
O agendador diário (`POST /api/system/notifications/run`) envia o próximo passo devido de cada
fatura em aberto (RN-2603).

### WhatsappSetting (Config de WhatsApp por tenant) — spec 0014

Uma linha por tenant. Diz **de qual número** o tenant envia.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `tenantId` | String | — | PK/único — 1 por tenant |
| `provider` | String | `log` | `log` (só loga) ou `cloud` (Meta Cloud API) |
| `phoneNumberId` | String? | — | Phone Number ID da Meta |
| `token` | String? | — | Token da Meta (**segredo** — write-only na API: `getMasked` devolve `hasToken`, nunca o valor; **cifrado em repouso**, AES-256-GCM / D-17) |

### OnboardingState (Estado do onboarding por tenant) — spec 0021

Uma linha por tenant. Guarda só as **flags de UI** do onboarding guiado; o progresso
dos passos é **derivado** de dados reais (tem gateway? tem cliente? tem fatura?). A
linha só nasce quando o dono dispensa o checklist ou pula o WhatsApp.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `tenantId` | String | — | PK/único — 1 por tenant |
| `dismissed` | Boolean | `false` | Dono fechou o checklist manualmente |
| `whatsappSkipped` | Boolean | `false` | Pulou o passo opcional de WhatsApp |

### Payment (Recebimento) — spec 0015

Fonte única do "dinheiro que entrou": nasce do gateway (webhook) ou de uma baixa manual.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `amount` | Decimal(12,2) | valor recebido |
| `method` | String? | `pix`/`dinheiro`/`transferencia`/`cartao`/`boleto`/`outro` (obrigatório na baixa manual) |
| `source` | String | `manual` \| `gateway` |
| `paidAt` | DateTime | data do recebimento |
| `note` / `receiptUrl` | String? | observação / comprovante (URL; upload real é futuro) |
| `invoiceId` | String | FK → Invoice (`onDelete: Cascade`) |
| `tenantId` | String | FK → Account (`onDelete: Cascade`) |

Índices: `@@index([invoiceId])`, `@@index([tenantId])`, `@@index([tenantId, paidAt])`.

### InteractionEvent (Evento de interação) — spec 0016 (Fundação "Elo")

Fonte única e **append-only** do **comportamento** do pagador ao longo do ciclo da
cobrança. É a substância da autonegociação (M2), do Cockpit (M4) e do Score (M5).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `type` | String | `link_created`/`sent`/`delivered`/`read`/`failed`/`open`/`pay_attempt`/`paid` (constantes em `src/domain/interaction.ts`) |
| `channel` | String? | `whatsapp`/`sms`/`email`/`web` |
| `metadata` | Json? | mínimo: `{ ua?, ipHash?, providerMessageId? }` — **sem IP cru / PII** (RN-ELO6) |
| `occurredAt` | DateTime | quando o evento de fato ocorreu |
| `createdAt` | DateTime | `now()` |
| `invoiceId` | String? | FK → Invoice (`onDelete: Cascade`) |
| `clientId` | String? | FK → Client (`onDelete: SetNull`) |
| `tenantId` | String | FK → Account (`onDelete: Cascade`) — escopo |

Índices: `@@index([invoiceId])`, `@@index([invoiceId, type])` (contagem do "Botão de
Alívio": `open>=N` e sem `paid`), `@@index([tenantId, occurredAt])` (timeline/Cockpit).

> **Identidade cross-tenant do pagador (`Payer`)** — o score que *viaja* entre
> tenants — é follow-up do M5 (com trava LGPD); aqui o evento se liga a
> `invoiceId`/`clientId` (o `Client` já é o pagador dentro do tenant).

### RecoveryCase (Caso de recuperação) — spec 0033 (F1)

Orquestra a **recuperação de uma fatura vencida** até um desfecho explícito. **Um caso
aberto por fatura** (idempotente). "Orbita" a fatura — não altera a máquina de estados dela.

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `reason` | String | `overdue` | `overdue`/`payment_failed`/`pix_unpaid`/`card_expired` |
| `status` | String | `open` | `open`/`recovering`/`recovered`/`lost`/`cancelled` |
| `amountAtRisk` | Decimal(12,2) | — | `= Invoice.value` na abertura |
| `currentStep` | Int | `0` | Passo atual da sequência (máx. `DEFAULT_MAX_STEPS`) |
| `lastChannel` | String? | — | Último canal usado (`whatsapp`/`email`) — base da troca de canal |
| `reliefOffered` | Boolean | `false` | Se o passo de alívio (0018) já foi ofertado |
| `nextActionAt` | DateTime? | — | Quando o próximo passo fica devido (avança 1/dia) |
| `openedAt` / `resolvedAt` | DateTime | — | Abertura / desfecho |
| `outcome` | String? | — | `paid`/`agreement`/`sem_resposta`/`cancelado_pelo_dono` |
| `invoiceId` | String | — | **Único** (1 caso por fatura). FK → Invoice |
| `clientId` / `subscriptionId` | String / String? | — | FKs |
| `tenantId` | String | — | FK → Account. Escopo obrigatório |
| `attempts` | RecoveryAttempt[] | — | Timeline 1-N |

Índice: `@@index([tenantId, status, nextActionAt])` (o sweep busca casos devidos por tenant).

### RecoveryAttempt (Tentativa de recuperação) — spec 0033

Append-only: cada passo executado pelo sweep vira uma linha (timeline do caso).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `step` | Int | número do passo |
| `channel` | String? | `whatsapp`/`email` |
| `action` | String | `remind`/`switch_channel`/`offer_relief` (decisão do domínio) |
| `result` | String? | `sent`/`failed`/`opened`/`paid` |
| `occurredAt` | DateTime | quando ocorreu |
| `caseId` | String | FK → RecoveryCase |
| `tenantId` | String | escopo |

Índice: `@@index([tenantId, caseId])`.

## Máquinas de estado

### Status do Cliente
```
EM_DIA  ──(atrasa)──►  EM_ATRASO
   ▲                        │
   └──────(regulariza)──────┘
```
- Valores conhecidos: `EM_DIA` (padrão), `EM_ATRASO`.
- `EM_ATRASO` é filtro obrigatório em `findPendingInvoices` (só notifica inadimplentes).
- ⚠️ `status` é `String` livre no schema — não há enum garantindo os valores. Ver `tech-debt.md`.

### Status da Fatura
```
PENDING ──► PAID
   │
   ├──────► OVERDUE
   │
   └──────► FAILED
```
- Valores válidos: `PENDING`, `PAID`, `OVERDUE`, `FAILED` — centralizados em `src/domain/status.ts` (`InvoiceStatus`).
- `PENDING` → `PAID`: via webhook, preenche `paidAt`.
- **Máquina de estados** (`canTransitionInvoice`): `PAID` é **terminal** (não regride); mesmo-status é no-op. Aplicada no webhook (RN-P7).
- ⚠️ No banco `status` ainda é `String` (não enum nativo Postgres) — conversão pendente (D-07/PR-15).
- **Status EFETIVO / "vencida" derivada (spec 0034):** `OVERDUE` é, na prática, um
  **status derivado da data** — `effectiveInvoiceStatus(status, dueDate, now)` devolve
  `OVERDUE` quando `status === PENDING` **e** `dueDate < now`. A **exibição** (tela
  Faturas, via `statusEfetivo`) e o Cockpit usam essa **fonte única**, então "vencida"
  aparece no instante em que a data passa — sem depender de job. O `status` **persistido**
  reflete só eventos explícitos (`PAID`/`FAILED`/`RENEGOTIATED`); o sweep da recuperação
  (0033) o mantém como **cache** de `OVERDUE`, mas a UI não depende dele. Regra da
  exibição ("está vencida?") ≠ regra da ação ("recuperar agora?", motor 0033, 1x/dia).

### Status do RecoveryCase (spec 0033)
```
open ──► recovering ──► recovered   (pago / acordo)   [terminal]
   │           │
   │           ├───────► lost        (passos esgotados) [terminal]
   │           │
   └───────────┴───────► cancelled   (encerrado pelo dono) [terminal]
```
- Abre em `open`; ao avançar passos fica `recovering`.
- `recovered`/`lost`/`cancelled` são **terminais** (fechamento idempotente).

## Regras de negócio

### Multi-tenancy (ver `../specs/0001-multi-tenancy.md`)
- **RN-T1**: Todo `Client`/`Invoice` pertence a exatamente um `Account` (`tenantId` obrigatório).
- **RN-T2**: Toda leitura/escrita interna é escopada por `tenantId` (via `tenant-context`), exceto entradas globais legítimas (`findByGatewayId` no webhook).
- **RN-T3**: `Client.phone` é único **por tenant** (dois tenants podem ter o mesmo telefone).
- **RN-T4**: O `tenantId` vem do JWT (contexto), nunca do corpo/params.
- **RN-T5**: O `tenantId` viaja no payload da fila; o worker processa no tenant da mensagem.
- **RN-T6**: O webhook resolve o tenant pela fatura (`gatewayId` → `Invoice.tenantId`).

### Usuários / Autenticação (ver `../specs/0002-user-model-signup.md`)
- **RN-U1**: `User.email` é único global (login).
- **RN-U2**: Senha só em hash (bcrypt), nunca texto puro.
- **RN-U3**: Signup cria atomicamente `Account` + `User(OWNER)`.
- **RN-U4**: Login emite JWT `{ sub: userId, tenantId, role }`.
- **RN-U5**: Conta de serviço via env é fallback de bootstrap (opcional).

### Clientes
- **RN-C1**: Telefone é único. Criar cliente com telefone existente → erro `"Já existe um cliente com este telefone."`.
- **RN-C2**: Nome ≥ 3 caracteres, telefone ≥ 10 dígitos, documento ≥ 11 caracteres (validação Zod).
- **RN-C3**: Deletar cliente remove suas faturas em cascata (`onDelete: Cascade`).

### Faturas
- **RN-I1**: Valor deve ser positivo (`> 0`).
- **RN-I2**: Ao criar, a fatura nasce `PENDING` com `gatewayId`/`pixCopyPaste` gerados (hoje mockados).
- **RN-I3**: Webhook só atualiza fatura existente (localizada por `gatewayId`); senão erro `"Fatura correspondente ao Gateway não encontrada."`.
- **RN-I4**: `gatewayId` é único — não pode haver duas faturas com o mesmo ID de gateway.
- **RN-I5**: **Dinheiro é `Decimal(12,2)`** (`value`, `amount`, `unitPrice`, `debtValue`), nunca `Float` — evita erro de arredondamento binário. Somas de itens usam `Prisma.Decimal`. A API converte `Decimal → number` na saída (middleware `serializeDecimal`), mantendo o contrato JSON em `number`.

### Pagamento / Gateway (ver specs 0003, 0011, 0012)
- **RN-P1**: `createPayment` **reserva a fatura primeiro** (PENDING, sem gateway), depois cria a cobrança no provider **resolvido por tenant** (`resolvePaymentGatewayForTenant` a partir de `PaymentSetting`; fallback = `PAYMENT_PROVIDER`) e faz `attachCharge` (`gatewayId`/`checkoutUrl`/PIX). Se o gateway falhar, a reserva é desfeita (`deleteById`) — sem cobrança órfã.
- **RN-P3**: Webhook é **idempotente e atômico** — registrar o evento (`WebhookEvent`, unique = trava) e atualizar o status acontecem na **mesma transação** (`applyWebhookAtomic`); evento repetido é no-op.
- **RN-P4**: Autenticidade do webhook é do provider (`mock`: `x-webhook-secret`; `mercadopago`: assinatura `x-signature`; `infinitepay`: a validar com a doc oficial).
- **RN-P5**: Status MP → fatura: `approved`→`PAID`, `pending`/`in_process`→`PENDING`, `rejected`/`cancelled`/`refunded`→`FAILED`.
- **RN-P6**: Cada tenant recebe na **própria conta** (`PaymentSetting`). O default do sistema é `infinitepay` (handle público).
- **RN-P7**: **Guarda de ordem** — uma fatura já `PAID` **não regride** por evento de webhook fora de ordem (ex.: um `pending` que chega atrasado é ignorado).

### Assinaturas / Recorrência (ver `../specs/0009-recurring-billing.md`)
- **RN-S1**: Uma assinatura `ACTIVE` gera **uma** `Invoice` por competência (`period`, ex. `2026-07`). `@@unique([subscriptionId, period])` garante **idempotência** — rodar o gerador duas vezes não duplica. A geração **reserva a fatura antes de chamar o gateway**, então corridas (cron + disparo manual) não geram cobrança dupla (o perdedor do unique não chama o gateway).
- **RN-S2**: `SubscriptionService.run(now)` gera, por execução, no máximo uma competência por assinatura vencida.
- **RN-S3**: Assinaturas `PAUSED`/`CANCELED` não geram faturas.
- **RN-S4**: A fatura gerada entra no ciclo normal (overdue → notificação → webhook → PAID).

### Configuração por tenant (ver specs 0012 e 0014)
- **RN-CFG1**: `PaymentSetting` e `WhatsappSetting` têm **uma linha por tenant** (`tenantId` único).
- **RN-CFG2**: Segredos (token WhatsApp, `mpAccessToken`) são **write-only na API**: a leitura devolve um booleano (`hasToken`) / valor mascarado, nunca o segredo. Ao salvar sem informar o token, o valor anterior é **preservado**. O token de WhatsApp é **cifrado em repouso** (AES-256-GCM, D-17).
- **RN-CFG3**: O worker resolve o provider de WhatsApp **por tenant** a cada mensagem (`resolveWhatsappForTenant`); sem config own, cai no `log`.

### LGPD / Direitos do titular (ver `../specs/0004-lgpd.md`)
- **RN-L1**: Export retorna cliente + faturas, escopado por tenant.
- **RN-L2**: Anonimizar remove PII (nome/telefone/documento) e marca `anonymizedAt`, mas **mantém** as faturas (retenção legal).
- **RN-L3**: Telefone anonimizado usa placeholder único (`anon-<id>`) para respeitar a unique por tenant.
- **RN-L4**: Anonimização é idempotente.

### Notificação / Cobrança
- **RN-N1**: Só entram na listagem de cobrança faturas `PENDING` cujo **cliente** esteja `EM_ATRASO`.
- **RN-N2**: O disparo é **assíncrono**: a API enfileira e responde `202`; o envio real ocorre no worker.
- **RN-N3**: Se o worker não encontrar o cliente pelo telefone, a mensagem é **descartada (ACK)** — não faz requeue.
- **RN-N4**: Após enviar, a fatura recebe `notificationSent = true`.
- **RN-N5**: Erros no worker são classificados (`shouldRequeue`): **permanente** (`PermanentError` — payload malformado / sem `tenantId`) → `nack` **sem requeue** → vai direto para a DLQ; **transitório** (demais) → `nack` com requeue, limitado pelo `x-delivery-limit` (após N, também DLQ). Sem loop infinito.

### Recebimentos (ver `../specs/0015-recebimentos.md`)
- **RN-REC1**: Todo recebimento (manual ou gateway) cria um `Payment` ligado à fatura, escopado por tenant.
- **RN-REC2**: A **baixa manual** (`POST /api/invoices/:id/payments`) marca a fatura `PAID` (v1 = quitação total), respeitando `canTransitionInvoice`, e grava `paidAt`. Fatura já `PAID` → **409** (não duplica).
- **RN-REC3**: O webhook do gateway cria um `Payment` (`source=gateway`) na MESMA transação, **só na transição efetiva para PAID** (`shouldRecordGatewayPayment`) — reconfirmação não duplica.
- **RN-REC4**: `method` obrigatório na baixa manual: `pix`/`dinheiro`/`transferencia`/`cartao`/`boleto`/`outro`.
- **RN-REC5**: `amount` default = valor da fatura; se informado, `> 0`.
- **Fora de escopo v1**: pagamento parcial e estorno de baixa (ver `tech-debt`).

### Interação / Link próprio "Elo" (ver `../specs/0016-elo-link-eventos.md`)
- **RN-ELO1**: Toda fatura ganha um `linkToken` **único e não-adivinhável** na criação; a mensagem de cobrança usa `APP_URL/r/:token`, não o `checkoutUrl` cru.
- **RN-ELO2**: `GET /r/:token` é **público**, registra um evento `open` (canal `web`) e responde **302** para o pagamento (`checkoutUrl`; sem ele, página mínima com o PIX). Token inexistente → **404**.
- **RN-ELO3**: `InteractionEvent` é **append-only** (nunca edita/apaga).
- **RN-ELO4**: A resolução do `linkToken` é **entrada global legítima** (exceção da RN-T2, como `findByGatewayId`): sem contexto de tenant, o `tenantId` vem da própria fatura.
- **RN-ELO5**: `sent` é gravado pelo worker (junto de `markNotificationSent`); `paid` é gravado na **mesma transação** da transição **efetiva** para `PAID` — no webhook (`applyWebhookAtomic`) **e** na baixa manual (`settleManually`) — sem duplicar em reconfirmação.
- **RN-ELO6**: **Privacidade/LGPD** — `metadata` guarda o mínimo; IP só como **hash com salt** (`EVENT_IP_SALT`), nunca cru.
- **RN-ELO7**: A rota pública `/r/:token` tem **rate-limit próprio** (`linkLimiter`), separado do limite das rotas internas.
- **RN-ELO8**: `type`/`channel` são constantes centralizadas (`src/domain/interaction.ts`); enum nativo é follow-up (junto de D-07).
- **RN-ELO9**: **Semente da autonegociação (M2)**: `isHesitating` = `open >= N` e sem `paid`. v1 só expõe os dados (contagem por tipo em `GET /api/invoices/:id/events`); a oferta é do M2.

### Recuperação de pagamento falho (ver `../specs/0033-recuperacao-pagamento-falho.md` — F1)
- **RN-3301**: Ao uma fatura vencer, abre-se **um** `RecoveryCase` (idempotente: um caso aberto por fatura). `amountAtRisk = Invoice.value`.
- **RN-3310**: Como não há job que marque vencidos por data, o **próprio sweep**, ao abrir o caso, marca a fatura `PENDING → OVERDUE` (`markOverdueByIds`) — o status reflete o vencimento em Faturas/Recuperações/Cockpit.
- **RN-3302**: Enquanto o caso está aberto, a recuperação é a **dona da comunicação** da fatura; a régua (0026) **pula** faturas com caso ativo (`findActiveInvoiceIds`) — sem duplo envio.
- **RN-3303**: O sweep avança **no máximo um passo/dia** por caso cujo `nextActionAt <= hoje` (idempotente por passo/dia).
- **RN-3304**: O passo é **adaptativo** (`decideNextStep`, domínio puro): hesitação no Elo (`open >= hesitationOpens` e sem `pay_attempt`) com alívio ligado → `offer_relief`; senão `remind`.
- **RN-3305**: Se o envio falha no canal atual, o próximo passo troca de canal (`switch_channel`, via `resolveChannels`/0032) antes de escalar.
- **RN-3306**: Fecha como `recovered` no webhook `PAID`, na baixa manual (`outcome=paid`) **ou** no aceite de acordo (`outcome=agreement`) — via `closeCase(invoiceId, outcome)`, idempotente e cross-tenant.
- **RN-3307**: Passos esgotados sem sucesso → `lost` (`outcome=sem_resposta`), visível no painel.
- **RN-3308**: O dono pode encerrar manualmente → `cancelled` (`outcome=cancelado_pelo_dono`).
- **RN-3309**: Tudo escopado por `tenantId`; cada ação grava um `RecoveryAttempt`.
- Constantes do domínio: `DEFAULT_MAX_STEPS`, `DEFAULT_STEP_INTERVAL_DAYS` (`src/domain/recovery.ts`).

## Glossário

- **Gateway**: provedor de pagamento externo. Default **InfinitePay**; também `mercadopago` e `mock` (testes). Resolvido **por tenant**.
- **Competência (`period`)**: o mês de referência de uma fatura de assinatura (ex.: `2026-07`).
- **PIX copia-e-cola**: string do PIX para o cliente pagar.
- **Inadimplente**: cliente com `status = EM_ATRASO`.
- **Notificação/Cobrança**: mensagem de WhatsApp enviada para cobrar uma fatura pendente.
- **Tenant / multi-tenancy**: cada cliente do SaaS é um `Account`; dados isolados por `tenantId`. Ver [`devops-infra.md`](./devops-infra.md).
