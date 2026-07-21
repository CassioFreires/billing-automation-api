# Spec 0018 — M2: Autonegociação sem atrito ("Botão de Alívio de Caixa")

- **Status**: Implementada (v1 — backend + frontend, validada no gateway `mock`) · 2026-07-21
- **Autor**: Cassio
- **Data**: 2026-07-21
- **Dívida relacionada**: **D-18** (webhook InfinitePay E2E — **bloqueante para PRODUÇÃO, não para desenvolvimento**: todo o M2 roda e é testável no gateway `mock`), **D-22** (recebimentos: parcial/estorno) — ver `context/tech-debt.md`
- **Relacionada**: `visao-produto.md` (**M2 — o ROSTO do produto**); consome a **Fundação Elo** (spec **0016**: `InteractionEvent`, `linkToken`, `isHesitating`, RN-ELO9) e o **gateway por tenant** (spec **0012**); aparece no **Cockpit** (spec **0017**, fila "Hesitando")

> **Escopo deste doc:** a **autonegociação disparada por comportamento** (o "uau" da
> demo). A **régua multi-passo** (dunning: vários lembretes antes/depois do
> vencimento — `ReminderRule`) é a *outra metade* do M2 e fica numa **spec irmã
> (0019)**, seguindo "uma feature por spec". Aqui tratamos: a **página de acordo
> hospedada pelo Adimplo**, as **regras de alívio por tenant**, a entidade
> **`Agreement`** e a **geração da nova cobrança**.

## 1. Problema / Motivação

A Fundação Elo (spec 0016) já **detecta a dúvida**: uma fatura com
`open >= N AND paid == 0` é uma fatura "Hesitando" (o pagador abriu o link várias
vezes e travou na hora de pagar — `isHesitating`, RN-ELO9). Isso já aparece no
Cockpit (spec 0017, `acoes.hesitando`).

Mas hoje o sistema **só observa** — não **age**. Quando o pagador hesita, a única
saída é o dono **negociar na mão pelo WhatsApp** ("consegue pagar em 2x?"). Isso:

- **não escala** (o dono vira gargalo e call center de cobrança);
- é **constrangedor** (negociar dívida pessoa-a-pessoa azeda a relação — o oposto
  do posicionamento "cobrança humanizada");
- **perde a janela** (a dúvida é agora; a negociação manual chega tarde).

O diferencial do Adimplo (`visao-produto.md` §1.1) é ser **dono da camada de
interação**: se ele detecta a dúvida, ele pode **oferecer a saída sozinho**, dentro
de regras que o dono definiu **antes**. Nenhum "disparador de lembrete" faz isso —
é o fosso.

## 2. Objetivo

Fechar o loop **detectar → agir**: transformar a hesitação (dado do Elo) em uma
**oferta automática de alívio**, self-service, na própria página do Adimplo.

1. **Página de acordo hospedada pelo Adimplo** (`GET /r/:token`) — em vez do 302
   cru para o gateway (comportamento v1 da 0016), o Elo passa a **renderizar uma
   página própria** com o botão "Pagar" **e**, quando a fatura está hesitando, o
   **Botão de Alívio de Caixa** com as opções pré-aprovadas pelo dono.
2. **Regras de alívio por tenant** (`NegotiationSetting`) — o dono define **uma
   vez**: desconto à vista, nº máximo de parcelas, e prazo/taxa de adiamento. O
   Adimplo **nunca** oferece além disso.
3. **Aceite gera uma nova cobrança real** — ao escolher uma opção, o Adimplo cria
   **uma nova `Invoice` + charge no gateway** com os termos do acordo, registra um
   `Agreement`, e **supersede** a fatura original. O pagador paga a nova; o webhook
   concilia como sempre.

**Fora de escopo (follow-ups, com dono explícito):**
- **Régua multi-passo (`ReminderRule` / dunning)** → **spec 0019** (a outra metade
  do M2). Esta spec assume a fatura já existente e o pagador já no link.
- **Parcelamento no cartão dentro da própria página** — depende de o gateway do
  tenant suportar parcelas (InfinitePay/MP cartão). v1 pode entregar
  **à-vista-com-desconto** e **adiar-vencimento** primeiro (não exigem tokenização
  de cartão) e o **parcelar** logo atrás; ver §6/§9. Sinalizar claramente se ficar
  para v1.1.
- **Loop que aprende (M4 → M2)** — ajustar o limiar/oferta pelo histórico do
  pagador (Cockpit) → fica para depois do Score (M5).
- **Estorno / pagamento parcial** — a máquina de estados atual trata `PAID` como
  terminal (D-22). O acordo **não** faz baixa parcial; ele **substitui** a cobrança.

## 3. Regras de negócio

- **RN-NEG1** — **Gatilho**: o Botão de Alívio só aparece quando
  `isHesitating(counts, setting.hesitationOpens)` é verdadeiro para a fatura
  (reusa a função pura da 0016, RN-ELO9) **e** a fatura está **em aberto**
  (`PENDING`/`OVERDUE`). Fatura paga/renegociada nunca oferece alívio.
- **RN-NEG2** — **Teto do dono**: toda oferta é **limitada** pelo `NegotiationSetting`
  do tenant. O Adimplo nunca gera desconto maior, parcela além do máximo, nem adia
  além do prazo configurado. Se o dono não configurou / desabilitou, **não há
  oferta** (só o botão "Pagar" normal).
- **RN-NEG3** — **Um acordo ativo por fatura**: enquanto houver um `Agreement`
  `PENDING` (nova cobrança emitida, ainda não paga), novas tentativas de acordo para
  a **mesma** fatura retornam o acordo vigente (idempotente) — não geram cobranças
  empilhadas. Guarda por unique parcial (`invoiceId` com status ativo).
- **RN-NEG4** — **Aceite = nova cobrança + supersede**: aceitar uma opção cria uma
  **nova `Invoice`** (via o mesmo seam `gateway.createCharge`, RN-P*) com os termos
  do acordo e transiciona a **original** para **`RENEGOTIATED`** (novo estado
  terminal — deixa de contar como inadimplência/aberta). O `Agreement` amarra
  `originalInvoiceId ↔ newInvoiceId`.
- **RN-NEG5** — **Herança de identidade**: a nova fatura herda `clientId`/`tenantId`
  da original e **ganha seu próprio `linkToken`** (Elo continua: a nova cobrança
  também é uma página viva). Os eventos do Elo da nova fatura começam do zero.
- **RN-NEG6** — **Conciliação inalterada**: o pagamento da nova cobrança segue o
  fluxo normal (webhook → `applyWebhookAtomic` → `PAID` + `Payment` + evento `paid`).
  Nada de caminho de pagamento paralelo. O acordo é resolvido (`ACCEPTED`) quando a
  nova fatura é paga.
- **RN-NEG7** — **Entrada global legítima**: a página de acordo e o aceite resolvem
  o tenant **pela fatura via `linkToken`** (mesma exceção da RN-ELO4/RN-T2), pois são
  rotas **públicas** (o pagador não tem JWT).
- **RN-NEG8** — **Eventos do funil**: registrar no `InteractionEvent` (append-only,
  0016) os novos tipos `relief_offered` (oferta exibida) e `relief_accepted` (opção
  escolhida), além de `pay_attempt` — que agora é **preciso**, porque a página é
  hospedada pelo Adimplo (some a aproximação do redirect citada na 0016 §2).
- **RN-NEG9** — **Regras de dinheiro exatas**: desconto/taxa/parcela calculados em
  `Prisma.Decimal` (nunca float — RN-P6). Desconto e adiamento têm **teto** e
  **arredondamento** definidos; valor final nunca negativo.
- **RN-NEG10** — **Anti-abuso**: rota pública com rate-limit dedicado (herda o
  `linkLimiter` da 0016 e adiciona limite ao POST de aceite). O aceite é
  **idempotente** (RN-NEG3) — reenvio não multiplica cobranças.
- **RN-NEG11** — **Auditabilidade**: o `Agreement` guarda o **snapshot** dos termos
  aplicados (tipo, desconto/taxa/parcelas, valor original, valor final, novo
  vencimento) — não referências mutáveis ao `NegotiationSetting`, que pode mudar
  depois.

## 4. Impacto no modelo de dados

Atualizar `context/domain-model.md`.

### Nova entidade `NegotiationSetting` (1:1 com `Account`/tenant)
| Campo | Tipo | Notas |
|---|---|---|
| `tenantId` | String | PK/unique → Account (`onDelete: Cascade`) |
| `enabled` | Boolean | liga/desliga o alívio no tenant (default `false`) |
| `hesitationOpens` | Int | limiar de aberturas (default `3` — `DEFAULT_HESITATION_OPENS`) |
| `discountEnabled` | Boolean | permite "à vista com desconto" |
| `discountPercent` | Decimal | teto do desconto (ex.: `0.10` = 10%) |
| `installmentsEnabled`| Boolean | permite parcelar |
| `maxInstallments` | Int | teto de parcelas (ex.: `3`) |
| `deferEnabled` | Boolean | permite adiar vencimento |
| `deferMaxDays` | Int | teto de dias de adiamento (ex.: `7`) |
| `deferFeePercent` | Decimal | taxa sobre o valor ao adiar (pode ser `0`) |
| `updatedAt` | DateTime | |

### Nova entidade `Agreement` (append de negociação; 1 ativo por fatura — RN-NEG3)
| Campo | Tipo | Notas |
|---|---|---|
| `id` | String (uuid) | PK |
| `tenantId` | String | FK → Account (`onDelete: Cascade`) — escopo |
| `originalInvoiceId` | String | FK → Invoice (`onDelete: Cascade`) |
| `newInvoiceId` | String? | FK → Invoice — a cobrança gerada pelo acordo |
| `type` | String | `discount` / `installments` / `defer` |
| `terms` | Json | snapshot: `{ originalValue, finalValue, discountPercent?, installments?, newDueDate?, feePercent? }` (RN-NEG11) |
| `status` | String | `PENDING` (cobrança emitida) / `ACCEPTED` (nova paga) / `EXPIRED`/`CANCELLED` |
| `createdAt` | DateTime | `now()` |

Índice: unique parcial `(@@index)` garantindo **1 `Agreement` ativo por
`originalInvoiceId`** (status `PENDING`).

### Alterações em entidades existentes
- **`Invoice`**: novo estado **`RENEGOTIATED`** na máquina de estados
  (`src/domain/status.ts`, D-07) — a original entra nele ao gerar o acordo; é
  **terminal** (não regride, não conta como aberta/inadimplente). Opcional:
  `renegotiatedToId String?` (aponta para a nova fatura) para navegação — ou derivar
  via `Agreement`.
- **`src/domain/interaction.ts`**: novos `InteractionType` `RELIEF_OFFERED`
  (`relief_offered`) e `RELIEF_ACCEPTED` (`relief_accepted`). Seguem `String` no
  banco (enum nativo é follow-up junto de D-07 — igual RN-ELO8).

Migration **aditiva/idempotente** (padrão das anteriores: `CREATE TABLE IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`, FKs guardadas). Faturas/tenants legados: sem
`NegotiationSetting` → alívio desligado (RN-NEG2, fail-safe).

## 5. Contrato de API

**Públicas (sem JWT — resolvem tenant pela fatura, RN-NEG7; rate-limited):**
```
GET /r/:token                              (evolui a rota da 0016)
  → registra InteractionEvent(open, web)   [como na 0016]
  → renderiza a PÁGINA DE ACORDO do Adimplo:
      • botão "Pagar agora"  → checkoutUrl (ou PIX)
      • SE isHesitating & setting.enabled → Botão de Alívio + opções elegíveis
        (registra relief_offered)
  → 404 se token inexistente

GET /api/public/agreements/:token/options   (JSON p/ a página; público)
  Response: 200 {
    invoice: { value, dueDate, status },
    hesitating: boolean,
    options: [
      { type:'discount',     finalValue, discountPercent },
      { type:'installments', installments, installmentValue },
      { type:'defer',        newDueDate, finalValue, feePercent }
    ]                                        // só as habilitadas e dentro do teto
  }

POST /api/public/agreements/:token/accept   (público, rate-limited, idempotente)
  Request:  { type:'discount'|'installments'|'defer', installments?: number }
  Response: 201 { agreementId, newInvoice: { id, value, dueDate, linkToken, checkoutUrl } }
            200 { ...acordo vigente }        // já existia (RN-NEG3)
            409 { error }                    // fatura não elegível (paga/renegociada)
            422 { error }                    // opção fora das regras do tenant
```

**Internas (JWT — o dono configura):**
```
GET  /api/negotiation-settings              → 200 { ...setting }  (default se ausente)
PUT  /api/negotiation-settings              → 200 { ...setting }
  Request (Zod): { enabled, hesitationOpens, discount*, installments*, defer* }
  Validação: percentuais 0..1; maxInstallments >= 1; deferMaxDays >= 0.

GET  /api/invoices/:id/agreement            → 200 { agreement } | 404
  (histórico/estado do acordo de uma fatura — para o painel)
```

Validação Zod em todos os DTOs; `:token`/`:id` como string não-vazia.

## 6. Fluxo / Processamento

**1) Pagador abre o link (hesitando):**
```
GET /r/:token
  → findByLinkToken (entrada global, RN-NEG7)         → 404 se null
  → record(open, web)                                 [0016]
  → counts = countsByInvoice(invoice.id)
  → setting = NegotiationSettingService.getForTenant(invoice.tenantId)
  → if isHesitating(counts, setting.hesitationOpens) && setting.enabled:
        record(relief_offered); página mostra o Botão de Alívio
     else: página só com "Pagar agora"
```

**2) Pagador escolhe uma opção:**
```
POST /api/public/agreements/:token/accept  { type, installments? }
  → resolve fatura (token) + valida elegibilidade (RN-NEG1)     → 409 se não elegível
  → acordo ativo existente? → retorna ele (RN-NEG3, 200)
  → calcula termos (Decimal, RN-NEG9) respeitando o teto (RN-NEG2) → 422 se fora
  → TRANSAÇÃO:
      • cria nova Invoice (reserva) herdando client/tenant (RN-NEG5)
      • gateway.createCharge(novos termos)            [seam 0012/0016; usa D-18]
      • attachCharge(nova) + gera linkToken(nova)
      • cria Agreement(PENDING, snapshot dos termos)
      • Invoice original → RENEGOTIATED (canTransitionInvoice)
      • record(relief_accepted) na original; record(link_created) na nova
  → 201 { agreementId, newInvoice }
  (falha do gateway → desfaz a reserva, original permanece; padrão do createPayment)
```

**3) Pagador paga a nova cobrança:** fluxo normal (webhook →
`applyWebhookAtomic` → `PAID` + `Payment` + `paid`). Um passo extra: ao pagar a
`newInvoiceId`, marcar o `Agreement` como `ACCEPTED` (mesma tx, RN-NEG6).

Sem fila nova: tudo síncrono no request do pagador (criar charge é a mesma operação
do `createPayment` atual). A régua que **empurra** o pagador de volta ao link é a
spec 0019 (fora daqui).

## 7. Camadas afetadas

- [ ] Schema Prisma / migration — `NegotiationSetting`, `Agreement`, estado
      `RENEGOTIATED`, tipos `relief_*`
- [ ] Domínio — `src/domain/status.ts` (add `RENEGOTIATED` + transições),
      `src/domain/interaction.ts` (novos tipos), `src/domain/negotiation.ts` (novo:
      cálculo **puro** de desconto/parcela/adiamento a partir do setting — testável)
- [ ] DTO — `src/dtos/negotiationSetting.dto.ts`, `src/dtos/acceptAgreement.dto.ts`
- [ ] Repository — `negotiation-setting.repository.ts`, `agreement.repository.ts`;
      reuso de `invoice.repository` (create/attachCharge/transição)
- [ ] Service — `negotiation.service.ts` (regras + geração do acordo, orquestra o
      gateway como o `InvoiceService.createPayment`), `negotiation-setting.service.ts`
- [ ] Controller — `agreement.controller.ts` (público: options/accept),
      `negotiation-setting.controller.ts` (interno)
- [ ] Router — rota pública `/api/public/agreements/*` (fora do JWT, com rate-limit);
      `/api/negotiation-settings` (JWT); evolução de `link.controller` (render da
      página em `/r/:token`)
- [ ] Integração externa — `src/apis/payment/*`: garantir `createCharge` com
      **parcelas** (se `installments`); **D-18 fechado** (webhook InfinitePay E2E)
- [ ] Middleware — rate-limit do POST de aceite (`rate-limit.middleware.ts`)
- [ ] Frontend — a **página de acordo** (renderizada pelo Elo) e a tela de
      **configuração de alívio** no painel do dono (billing-automation-web)
- [ ] Testes — cálculo puro (`negotiation.ts`); elegibilidade (RN-NEG1);
      idempotência do aceite (RN-NEG3); teto respeitado (RN-NEG2, 422); supersede +
      `RENEGOTIATED`; eventos `relief_offered/accepted`; webhook da nova fecha o
      `Agreement`
- [ ] Docs — `visao-produto.md` (M2 → em andamento), `context/domain-model.md`,
      `context/fluxo-completo.md`, `context/overview.md`

## 8. Critérios de aceite

- [ ] Dado uma fatura em aberto com `open >= 3` e o tenant com alívio **ligado**,
      quando o pagador abre `/r/:token`, então a página mostra o Botão de Alívio com
      **apenas** as opções habilitadas e um evento `relief_offered` é gravado.
- [ ] Dado o alívio **desligado** (ou sem `NegotiationSetting`), quando o pagador
      abre o link, então **não** há oferta — só "Pagar agora" (RN-NEG2).
- [ ] Dado o pagador aceitando "à vista com desconto", quando `POST .../accept`,
      então nasce **uma** nova `Invoice` com `finalValue = value * (1 - discount)`
      (Decimal), a original vai para `RENEGOTIATED`, e há um `Agreement PENDING`.
- [ ] Dado um aceite repetido para a mesma fatura, então retorna o **mesmo** acordo
      (200) — nenhuma cobrança nova é criada (RN-NEG3).
- [ ] Dado um aceite com termo **fora do teto** do tenant (ex.: 6x com `maxInstallments=3`),
      então **422** e nada é criado (RN-NEG2).
- [ ] Dado uma fatura já `PAID`/`RENEGOTIATED`, quando `POST .../accept`, então
      **409** (não elegível — RN-NEG1).
- [ ] Dado o pagamento da nova cobrança (webhook), então a nova vira `PAID`, um
      `Payment` é criado e o `Agreement` vira `ACCEPTED` (RN-NEG6).
- [ ] Rotas públicas de acordo são **escopadas pela fatura** (token) e
      **rate-limited**; nenhuma expõe dado de outro tenant.

## 9. Riscos / considerações

- **Gateway (D-18) — bloqueante só para PRODUÇÃO**: o aceite usa o seam
  `PaymentGatewayProvider` (resolvido por tenant, spec 0012), então o M2 é
  **agnóstico de gateway**. No `mock`, criar cobrança e confirmar pagamento
  (webhook por `x-webhook-secret`) funcionam ponta a ponta — todo o fluxo foi
  desenvolvido e validado assim. Para o 1º cliente pagante **real**, fechar o
  webhook do InfinitePay E2E (D-18): é **troca de configuração** (`PaymentSetting`),
  a lógica do M2 não muda.
- **Parcelamento**: exige suporte do gateway do tenant (cartão parcelado). Se o
  provider não suportar, **omitir a opção** (RN-NEG2) — nunca oferecer o que não dá
  para cumprir. Faseiar: `discount`/`defer` primeiro (só mudam valor/vencimento),
  `installments` quando o `createCharge` expuser parcelas.
- **Máquina de estados**: `RENEGOTIATED` é novo estado terminal — revisar TODAS as
  leituras que assumem "aberta = PENDING|OVERDUE" (Cockpit `OPEN_STATUSES`,
  `findPendingInvoices`, aging) para **excluir** renegociadas e **não** contá-las
  como inadimplência nem como recebido. Erro aqui distorce os KPIs (spec 0017).
- **Abuso da oferta**: pagador poderia "forçar hesitação" (abrir 3x de propósito)
  para ganhar desconto. Mitigação: o desconto é **decisão do dono** (ele liga
  sabendo); limitar 1 acordo por fatura (RN-NEG3); e o limiar/janela são ajustáveis.
  Futuro (M5): condicionar ao **score** do pagador.
- **LGPD**: mais tracking comportamental (funil de oferta). Mantém a regra da 0016
  (mínimo, hash de IP; RN-ELO6) e entra na política de privacidade (spec 0004/PR-06).
- **Dinheiro**: todo cálculo em `Decimal`, com teto e arredondamento explícitos
  (RN-NEG9). Snapshot dos termos no `Agreement` (RN-NEG11) — mudar o setting depois
  não altera acordos já feitos.
- **Idempotência transacional**: criar nova fatura + supersede + evento devem ser
  atômicos (mesmo padrão do `applyWebhookAtomic`), senão uma falha no meio deixa a
  original em `RENEGOTIATED` sem cobrança nova (pagador sem como pagar).

## 10. Notas de implementação

Implementado (backend + frontend) em 2026-07-21, validado no gateway `mock`.

**Backend** (`billing-automation-api`):
- **Schema/migration** (`20260721000000_negotiation_agreements`): `NegotiationSetting`
  (1:1 tenant) + `Agreement` + estado `RENEGOTIATED` na máquina de estados
  (`domain/status.ts`) + tipos `relief_offered`/`relief_accepted`
  (`domain/interaction.ts`). Migration aditiva/idempotente.
- **Domínio puro** `domain/negotiation.ts`: `computeOptions`/`computeTerms`
  (Decimal, com teto do dono) + `isReliefEligibleStatus`. Coberto por
  `tests/unit/negotiation.test.ts`.
- **Fluxo**: `NegotiationService` (público, resolve tenant pela fatura via
  `runWithTenant`) — `getOptions`, `accept` (idempotente por fatura, RN-NEG3),
  `payAttempt`; `AgreementRepository.finalize` faz supersede + acordo + eventos em
  transação. O aceite gera a nova cobrança pelo **mesmo seam** de gateway por
  tenant (spec 0012). Webhook/baixa manual marcam o `Agreement` como `ACCEPTED`
  ao pagar a nova (RN-NEG6). Rotas: `/api/public/agreements/:token/{options,accept,
  pay-attempt}` (públicas, rate-limited) + `/api/settings/negotiation` (JWT) +
  `/api/invoices/:id/agreement` (JWT). `/r/:token` passou a redirecionar para
  `WEB_APP_URL/pagar/:token` (a página de acordo). 187 testes verdes; `tsc` limpo.

**Frontend** (`billing-automation-web`):
- **Página pública** `pages/Pay/PayPage.tsx` (rota `/pagar/:token`, fora do
  `ProtectedRoute`): mostra "Pagar agora" (PIX/checkout) e, quando `reliefAvailable`,
  o **Botão de Alívio** com as opções calculadas. Ao aceitar, mostra a nova
  cobrança. Reabrir após acordo aponta a nova cobrança (`activeAgreement`).
- **Config do dono** em `SettingsPage` (seção "Botão de Alívio de Caixa"): liga o
  alívio e define desconto/parcelas/adiamento (`useNegotiationSettings`).

**Decisões / fora do escopo (v1):**
- **Régua multi-passo (dunning)** → spec 0019 (não implementada aqui).
- **Parcelamento**: incluído, mas **sem juros** (só divide o total) e simulado no
  `mock`; no gateway real depende do suporte a cartão parcelado.
- **Loop M4→M2** (limiar/oferta que aprendem com o histórico) → após o Score (M5).
- **D-18** (InfinitePay E2E): pré-requisito de **produção**, não de dev (ver §9).
