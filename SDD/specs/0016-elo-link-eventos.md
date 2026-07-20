# Spec 0016 — Fundação "Elo": link próprio + eventos de interação

- **Status**: Aprovada
- **Autor**: Cassio
- **Data**: 2026-07-20
- **Dívida relacionada**: **D-02** (webhook de status do WhatsApp), **D-18** (webhook InfinitePay E2E) — ver `context/tech-debt.md`
- **Relacionada**: `visao-produto.md` (**Fundação Elo** — o coração); base direta de **M2** (autonegociação, o rosto), **M4** (Cockpit) e **M5** (Score)

## 1. Problema / Motivação

Hoje o link que o devedor recebe é o **`checkoutUrl` do gateway** — o Adimplo
**não é dono da camada de interação**. Consequência: não sabemos se o pagador
**abriu**, **clicou** ou **desistiu**; só sabemos "pagou / não pagou" (via webhook).

Sem esse dado, **nenhum diferencial do produto existe**:
- a **autonegociação sem atrito** (M2, o rosto) não tem como **detectar dúvida**
  ("abriu 3x e não pagou → oferece alívio");
- o **omnichannel** não sabe **trocar de canal** por taxa de abertura;
- o **Cockpit** (M4) e o **Score** (M5) ficam cegos ao comportamento.

O Adimplo precisa ser **dono do Elo**: um link próprio (página viva) e um registro
de **cada interação**.

## 2. Objetivo

Introduzir a **fundação de dados de comportamento**:

1. **Link próprio do Adimplo** — a mensagem de cobrança passa a usar um link em
   domínio do Adimplo (`/r/:token`) que **registra a abertura** e redireciona para o
   pagamento real. O Adimplo deixa de "emprestar" o link do gateway.
2. **`InteractionEvent`** — uma **fonte única** de eventos do ciclo de vida da
   cobrança: `link_created`, `sent`, `delivered`, `read`, `failed`, `open`,
   `pay_attempt`, `paid`.
3. **Leitura de eventos por fatura** — endpoint que alimenta as regras da régua
   (M2), o Cockpit (M4) e o Score (M5).

**v1 (esta spec):** entidade `InteractionEvent`; `Invoice.linkToken` + rota pública
`/r/:token` que grava `open` e redireciona; instrumentar `link_created` (criação),
`sent` (worker), `paid` (webhook). A mensagem de cobrança passa a usar o link
próprio.

**Fora de escopo (follow-ups, com dono explícito):**
- **Identidade do pagador cross-tenant (`Payer`)** — o moat de score que *viaja*
  entre tenants. Fica para a spec de **M5/Score**, porque exige **base legal LGPD**
  (consentimento) desenhada antes. Em v1, o evento se liga a `invoiceId`/`clientId`
  (o `Client` já é o pagador dentro do tenant).
- **Página de pagamento hospedada pelo Adimplo** — v1 **redireciona** para o
  `checkoutUrl` do gateway. Enquanto redirecionamos, `pay_attempt` é aproximado
  (registrado no redirect); a hospedagem própria (que permite `pay_attempt` preciso
  e a autonegociação embutida) entra na spec de **M2**.
- **`delivered`/`read`/`failed`** — dependem do **webhook de status do WhatsApp
  (D-02)**; o *tipo* de evento já nasce nesta spec, mas o **produtor** desses status
  entra quando D-02 fechar (sibling desta fundação).
- **Fechar o webhook do InfinitePay E2E (D-18)** — **pré-requisito de M2**, tratado
  como PR irmão (validar o contrato do webhook com a doc oficial + teste real). Não é
  código desta spec, mas é bloqueante para a autonegociação.

## 3. Regras de negócio

- **RN-ELO1**: Toda fatura ganha um `linkToken` **único e não-adivinhável** (uuid/
  nanoid) na criação; a mensagem de cobrança usa `APP_URL/r/:token`, não o
  `checkoutUrl` cru.
- **RN-ELO2**: `GET /r/:token` é **público** (sem JWT), registra um evento `open`
  (canal `web`) e responde **302** para o destino de pagamento (`checkoutUrl`; se
  ausente, uma página de fallback com o PIX copia-e-cola). Token inexistente → **404**.
- **RN-ELO3**: `InteractionEvent` é **append-only** (nunca se edita/apaga um evento);
  cada evento carrega `tenantId`, `type`, `occurredAt` e, quando aplicável,
  `invoiceId`/`clientId`/`channel`/`metadata`.
- **RN-ELO4**: O resolvedor de `linkToken` é uma **entrada global legítima**
  (exceção da RN-T2, igual ao `findByGatewayId` do webhook): busca a fatura pelo
  token **sem** contexto de tenant e deriva o `tenantId` da própria fatura.
- **RN-ELO5**: `sent` é registrado pelo **worker** ao enviar a cobrança (junto de
  `markNotificationSent`); `paid` é registrado pelo **webhook**, na **mesma
  transação** de `applyWebhookAtomic`, **só na transição efetiva para PAID** (mesma
  guarda do `Payment` gateway — não duplica em evento repetido).
- **RN-ELO6**: **Privacidade/LGPD** — `metadata` guarda o **mínimo** (user-agent
  truncado, hash do IP com salt — nunca o IP cru). Sem PII nova além do que já existe
  na fatura/cliente.
- **RN-ELO7**: A rota pública `/r/:token` tem **rate limit** próprio (anti-abuso/
  scraping de tokens), separado do limite das rotas internas.
- **RN-ELO8**: Os valores de `type` e `channel` são **constantes centralizadas**
  (`src/domain/interaction.ts`), no padrão de `src/domain/status.ts` (D-07). `type`/
  `channel` seguem `String` no banco por ora (enum nativo é follow-up, junto de D-07).
- **RN-ELO9**: **Semente da autonegociação (M2)** — a contagem
  `open >= N AND type 'paid' ausente` para uma fatura é a regra do **Botão de Alívio
  de Caixa**. v1 só **expõe os dados** (contagem por tipo); o disparo da oferta é M2.

## 4. Impacto no modelo de dados

Nova entidade **`InteractionEvent`** (atualizar `context/domain-model.md`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `tenantId` | String | FK → Account (`onDelete: Cascade`) — escopo |
| `invoiceId` | String? | FK → Invoice (`onDelete: Cascade`) |
| `clientId` | String? | FK → Client (`onDelete: SetNull`) — quem interagiu |
| `type` | String | `link_created`/`sent`/`delivered`/`read`/`failed`/`open`/`pay_attempt`/`paid` |
| `channel` | String? | `whatsapp`/`sms`/`email`/`web` |
| `metadata` | Json? | mínimo: `{ ua?, ipHash?, providerMessageId? }` (RN-ELO6) |
| `occurredAt` | DateTime | quando o evento ocorreu |
| `createdAt` | DateTime | `now()` |

Índices: `@@index([invoiceId])`, `@@index([invoiceId, type])` (contagem do Botão de
Alívio), `@@index([tenantId, occurredAt])` (Cockpit/timeline).

Alteração em **`Invoice`**: novo campo `linkToken String? @unique` (nullable p/
faturas legadas; preenchido na criação daqui pra frente).

Migration **aditiva/idempotente** (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT
EXISTS` + FKs guardadas), no padrão das anteriores. Faturas antigas ficam sem
`linkToken` (não quebram; só não têm link próprio retroativo — aceitável).

## 5. Contrato de API

```
GET /r/:token                                      (PÚBLICO, rate-limited)
  → registra InteractionEvent(open, channel=web)
  → 302 Location: <checkoutUrl>         (ou página de fallback com PIX)
  → 404 { error }                        (token inexistente)

GET /api/invoices/:id/events                       (JWT)
  Response: 200 {
    events: [ { type, channel, occurredAt, metadata } ],
    counts: { open: n, pay_attempt: n, paid: n, ... }   // agregado p/ regras/cockpit
  }
          404 { error }                  // fatura não encontrada no tenant
```

Sem novo DTO de escrita público — eventos nascem de gatilhos internos (criação/
worker/webhook/rota de redirect), não de input direto do usuário. Validação Zod
apenas no `:token` (string não-vazia) e no `:id`.

## 6. Fluxo / Processamento

**Criação da fatura (novo):**
```
InvoiceService.createPayment
  → gera linkToken (uuid) ao reservar a fatura
  → após attachCharge: registra InteractionEvent(link_created)
  → buildChargeMessage passa a usar APP_URL/r/:token  (não o checkoutUrl cru)
```

**Abertura do link (novo, público):**
```
GET /r/:token
  → LinkController.open
  → InvoiceRepository.findByLinkToken(token)   [entrada global — RN-ELO4]  (404 se null)
  → InteractionEventRepository.record(open, invoiceId, tenantId, channel=web, metadata mínima)
  → res.redirect(302, invoice.checkoutUrl ?? fallbackPixPage)
```

**Envio (ajuste no worker):**
```
invoice.worker → ao enviar a cobrança (seam WhatsApp)
  → markNotificationSent
  → InteractionEventRepository.record(sent, channel=whatsapp)
  [quando D-02 fechar: consumir status Meta → record(delivered/read/failed)]
```

**Pagamento (ajuste no webhook):**
```
webhook → applyWebhookAtomic (mesma tx do Payment gateway)
  → na transição efetiva p/ PAID: record(paid)   [idempotente — não duplica]
```

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `InteractionEvent` + `Invoice.linkToken`
- [ ] Domínio — `src/domain/interaction.ts` (constantes `InteractionType`/`Channel`)
- [ ] Repository — `src/repositories/interaction-event.repository.ts` (record, listByInvoice, countsByInvoice) + `invoice.repository`: gerar `linkToken`, `findByLinkToken`, registrar `paid` dentro de `applyWebhookAtomic`
- [ ] Service — `src/services/interaction.service.ts` (ou dobrar em invoice/notification): record helpers + leitura agregada
- [ ] Controller — `src/controllers/link.controller.ts` (rota pública `/r/:token`) + `getEvents` no invoice controller
- [ ] Router — rota pública `/r/:token` (novo router, montado fora do `/api` protegido, com rate-limit próprio) + `/api/invoices/:id/events`
- [ ] Worker — `src/works/invoice.worker.ts`: registra `sent`; `buildChargeMessage` usa o link próprio
- [ ] Middleware — rate-limit dedicado para `/r` (`rate-limit.middleware.ts`)
- [ ] Config — `APP_URL` (base do link) no `.env.example`; salt do hash de IP
- [ ] Testes — redirect grava `open` + 302; 404 em token inválido; `sent`/`paid` gravados uma vez (webhook idempotente não duplica `paid`); `countsByInvoice` para a regra `open>=N`
- [ ] Docs — `context/domain-model.md` (entidade + RN-ELO*), `context/fluxo-completo.md` (o link agora é próprio + eventos), `context/overview.md` (capacidade nova), `visao-produto.md` (Fundação Elo → em andamento)

## 8. Critérios de aceite

- [ ] Dado uma fatura criada, quando gero a cobrança, então nasce um `linkToken`
      único, um evento `link_created`, e a mensagem contém `APP_URL/r/<token>`.
- [ ] Dado um `token` válido, quando faço `GET /r/:token`, então é gravado um evento
      `open` (canal `web`, sem IP cru) e recebo **302** para o `checkoutUrl`.
- [ ] Dado um `token` inexistente, então **404** e nenhum evento é gravado.
- [ ] Dado o worker enviando a cobrança, então é gravado um evento `sent` e
      `notificationSent = true`.
- [ ] Dado o webhook confirmando o pagamento, então é gravado **um** evento `paid`; um
      webhook **duplicado** não grava um segundo `paid`.
- [ ] Dado 3 aberturas e nenhum pagamento, quando chamo `GET /api/invoices/:id/events`,
      então `counts.open == 3` e `counts.paid == 0` (semente do Botão de Alívio).
- [ ] `GET /api/invoices/:id/events` é escopado por tenant (fatura de outro tenant →
      404).

## 9. Riscos / considerações

- **Rota pública** (`/r/:token`): superfície nova sem JWT. Mitigar com token
  não-adivinhável (uuid/nanoid), rate-limit dedicado (RN-ELO7) e **nenhum dado
  sensível** na resposta (só o redirect).
- **LGPD**: tracking de comportamento é dado pessoal. Guardar o mínimo (RN-ELO6),
  hash de IP com salt, e cobrir na política de privacidade (spec 0004 / PR-06). A
  identidade **cross-tenant** fica fora desta spec justamente por isso.
- **Dependências para o rosto (M2)**: a autonegociação **exige** (a) `pay_attempt`
  preciso — que só vem quando o Adimplo **hospedar a página** (M2), não no redirect;
  e (b) **D-18** (gateway E2E) para gerar cobranças novas de verdade. Esta spec
  entrega a **base de eventos**; M2 monta a experiência em cima.
- **Omnichannel**: `delivered`/`read`/`failed` dependem de **D-02**. O tipo já existe;
  o produtor entra depois — sem bloquear esta fundação.
- **Volume de eventos**: append-only cresce. Índices por `invoiceId`/`tenantId` já
  cobrem as leituras; particionamento/retenção é problema de escala (P2), não de v1.
- **Compatibilidade**: faturas legadas sem `linkToken` continuam válidas (campo
  nullable); só não têm link próprio retroativo.

## 10. Notas de implementação

Implementado no backend em 2026-07-20 (PR-A/B/C).

- **Schema/migration** (`20260720000000_elo_link_events`): `InteractionEvent`
  (append-only) + `Invoice.linkToken @unique`. Migration aditiva/idempotente
  (`ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` + FKs guardadas).
- **Domínio** `src/domain/interaction.ts`: constantes `InteractionType`/
  `InteractionChannel` + `isHesitating` (função pura, semente do Botão de Alívio).
- **Link próprio**: `linkToken` gerado no `InvoiceRepository.create` (vale para
  fatura avulsa e recorrente); `findByLinkToken` (entrada global). Rota pública
  `GET /r/:token` (`link.controller.ts` + `link.router.ts`, montada em `/r` no
  `server.ts`, fora do `/api`), com `linkLimiter` próprio. `buildChargeMessage`
  passou a **preferir** o link próprio (`APP_URL/r/:token`).
- **Eventos**: `link_created` (service, após `attachCharge`, best-effort), `open`
  (rota pública, best-effort, IP só como hash com salt), `sent` (worker), `paid`
  (na tx de `applyWebhookAtomic` **e** de `settleManually` — decisão: pagamento
  manual também gera `paid`, senão o grafo de comportamento ficaria cego a ele).
- **Leitura**: `GET /api/invoices/:id/events` → `{ events, counts }` escopado por
  tenant (404 se a fatura não for do tenant).
- **Testes**: `interaction.test.ts` (`isHesitating`), `link.controller.test.ts`
  (open/404/redirect/fallback/best-effort), `getInvoiceEvents` + `buildChargeMessage`
  (link próprio) — **158 testes verdes**. Build `tsc` limpo, `prisma validate` ok.

**Decisões / fora do escopo confirmado (follow-ups em `tech-debt`):**
- **`Payer` cross-tenant** (score que viaja) → M5, com trava LGPD.
- **Página de pagamento hospedada** (para `pay_attempt` preciso + autonegociação
  embutida) → M2. Hoje `/r/:token` redireciona para o gateway.
- **`delivered`/`read`/`failed`** → dependem do webhook de status do WhatsApp (D-02);
  o tipo já existe, falta o produtor.
- **Enum nativo de `type`/`channel`** → junto de D-07.
- **`pay_attempt`** → só será preciso com a página própria (M2).

⚠️ **Sibling ainda pendente (pré-requisito de M2, não desta spec):** fechar o
webhook do InfinitePay E2E (D-18) e o teste real com gateway/PIX. Enquanto isso, o
fluxo é 100% testável com o gateway `mock` (webhook por `x-webhook-secret`).
