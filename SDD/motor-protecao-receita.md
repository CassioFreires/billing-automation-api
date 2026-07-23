# Motor de Proteção de Receita — roadmap técnico do diferencial

> **O que é este documento:** o desenho técnico do **coração** do Adimplo — o que
> o diferencia de "mais um sistema de cobrança". A cobrança (que todos têm) é o
> **sensor**; o motor é o que vem depois dela: **prever, recuperar e reter
> receita**. Serve nos dois modos: **avulso** e **recorrente**.
>
> Cada feature tem: **descrição · cenário · modelo de dados · regras (RN) ·
> checklist por camada**. O **Anel 1** está detalhado (é o que se constrói
> primeiro); os anéis 2 e 3 estão esboçados. Cada feature do Anel 1 deve virar uma
> **spec numerada** (`SDD/specs/0033+`) antes de codar.
>
> **Autor:** Cassio (com Claude) · **Data:** 2026-07-23 · **Base:** visao-produto.md
> (M2/M4/M5), specs 0009/0010/0016/0017/0018/0026/0032.

---

## 1. A lógica do motor

```
        ┌─────────────────────────────────────────────────────────────┐
        │  SENSOR (já existe)                                          │
        │  cobrança + Elo (open/pay_attempt) + pagamentos + assinaturas│
        └───────────────┬─────────────────────────────────────────────┘
                        ▼
        ┌───────────────────────────┐   F2 Radar de saúde do cliente
        │  RADAR — quem está em risco │  (score money + comportamento)
        └───────────────┬───────────┘
                        ▼
        ┌───────────────────────────┐   F1 Recuperação de pagamento falho
        │  AÇÃO — recupera antes de   │  F3 Fila de ação do dia
        │  perder                     │  F5 Winback · F6 PIX Auto · F7 NFS-e
        └───────────────┬───────────┘
                        ▼
        ┌───────────────────────────┐   F4 Previsão de caixa
        │  PROVA — mostra o dinheiro  │  (valor recuperado — já existe)
        │  salvo                      │
        └───────────────────────────┘
```

**Frase-guia:** *"Não sou mais um sistema de cobrança. Eu protejo a sua receita:
seguro o cliente pagando, recupero o que falha e aviso antes de você perder
alguém."*

---

## 2. Convenções (para todas as features)

Seguir sempre (ver `SDD/context/conventions.md`):
- Imports internos com extensão **`.js`** mesmo em `.ts` (ESM/NodeNext).
- Regra de negócio no **service**; banco só no **repository**; controller só HTTP.
- Validação com **Zod** nos DTOs.
- Todo dado novo é **escopado por `tenantId`** (multi-tenancy, spec 0001).
- Trabalho pesado/periódico vai para **worker + fila** (padrão do agendador, specs
  0010/0013) — nunca no request HTTP.
- **Testes Vitest** por feature (domínio puro + service com repositório mockado).
- Ao concluir, **atualizar o contexto** em `SDD/context/`.

---

## 3. Modelo de dados novo (visão geral)

Entidades novas e como se ligam às existentes (`Invoice`, `Subscription`,
`Client`, `InteractionEvent`, `Payment`):

```
Client ──1:1── ClientHealth        (F2 — score de risco/saúde)
Client ──1:N── RecoveryCase        (F1/F5 — caso de recuperação em aberto)
Invoice ─1:1── RecoveryCase        (o caso aponta para a fatura/assinatura)
RecoveryCase ─1:N── RecoveryAttempt (cada ação tomada na recuperação)
Subscription ─1:1── PaymentMandate (F6 — autorização de PIX Automático)
Invoice ──1:1── FiscalDocument     (F7 — NFS-e emitida)
```

Reaproveita: `InteractionEvent` (sinais de comportamento), `NegotiationSetting`/
`Agreement` (Botão de Alívio, spec 0018), `ReguaSetting` (régua, spec 0026).

---

# ANEL 1 — O núcleo (construir primeiro)

---

## F1 · Recuperação de pagamento falho (Guardião da Receita) ⭐

### Descrição
Quando um pagamento **falha** ou uma cobrança **vence sem pagar**, o sistema abre
um **caso de recuperação** e roda uma **sequência adaptativa** (máquina de estados)
que vai além da régua fixa: escala intensidade, **troca de canal**, e — se o Elo
detectar hesitação — **aciona o Botão de Alívio** (spec 0018). Nunca deixa a
receita morrer em silêncio; sempre termina em `recuperado` ou `perdido` (com
motivo), com o dono sabendo.

- **Recorrente:** salva a **assinatura** que ia cair (churn involuntário — o maior
  vazamento de um negócio recorrente).
- **Avulso:** persegue a fatura com intensidade proporcional a valor + risco (F2).

### Cenário
> A assinatura da **academia Fit** gera a fatura de julho do **João**. No dia do
> vencimento, o pagamento **não entra**. O sistema abre um `RecoveryCase`
> (`reason=overdue`, `amountAtRisk=150`). Dia 1: lembrete no canal preferido. Dia 3:
> o Elo mostra que o João **abriu 2x e não pagou** → o caso escala e dispara o
> **Botão de Alívio** ("parcele em 3x"). Dia 5: sem resposta → **troca de canal**
> (era e-mail, vai WhatsApp). Dia 7: João paga o parcelamento → o webhook fecha o
> caso como `recuperado`. Se não pagasse até o passo final, viraria `perdido`
> (`outcome=sem_resposta`) e apareceria no radar de churn.

### Modelo de dados
```prisma
model RecoveryCase {
  id             String    @id @default(uuid())
  reason         String    // overdue | payment_failed | card_expired | pix_unpaid
  status         String    @default("open") // open | recovering | recovered | lost | paused
  amountAtRisk   Decimal   @db.Decimal(12,2)
  currentStep    Int       @default(0)
  nextActionAt   DateTime?
  openedAt       DateTime  @default(now())
  resolvedAt     DateTime?
  outcome        String?   // paid | agreement | sem_resposta | cancelado_pelo_dono
  invoiceId      String    @unique
  clientId       String
  subscriptionId String?   // preenchido quando vem de assinatura
  tenantId       String
  attempts       RecoveryAttempt[]
}

model RecoveryAttempt {
  id         String   @id @default(uuid())
  step       Int
  channel    String?  // whatsapp | email
  action     String   // remind | switch_channel | offer_relief | retry_link
  result     String?  // sent | failed | opened | paid
  occurredAt DateTime @default(now())
  caseId     String
  tenantId   String
}
```
Migration aditiva idempotente.

### Regras de negócio
- **RN-F1-01** — Abre um `RecoveryCase` quando a fatura vira `OVERDUE` **ou** quando
  uma cobrança recorrente falha. Um caso **aberto por fatura** (idempotente).
- **RN-F1-02** — A sequência é **configurável por tenant** (passos, intervalos,
  quando ofertar alívio). Reaproveita `ReguaSetting`/`NegotiationSetting`.
- **RN-F1-03** — Adaptativa: se `open >= limiar AND pay_attempt = 0` (Elo), o passo
  vira `offer_relief` (dispara o Agreement da spec 0018).
- **RN-F1-04** — Se um canal falha, o próximo passo **troca de canal**
  (`resolveChannels`, spec 0032).
- **RN-F1-05** — Fecha o caso como `recovered` no webhook de pagamento
  (idempotente, RN-P3) ou ao aceitar um Agreement.
- **RN-F1-06** — Após o último passo sem sucesso → `lost` + `outcome`; alimenta F2.
- **RN-F1-07** — O avanço dos casos é **idempotente por passo/dia** (um passo por
  ciclo), no padrão do agendador (specs 0010/0026).

### Fluxo / processamento
- Novo **sweep diário** cross-tenant: `POST /api/system/recovery/run`
  (`x-cron-secret`) → fan-out por tenant → worker avança os casos `open`/`recovering`
  cujo `nextActionAt <= hoje`, executa a ação do passo e reprograma o próximo.
- Convive com a régua atual (spec 0026): a régua faz o lembrete "padrão"; o
  `RecoveryCase` é a camada que **decide e escala** quando a régua não resolve.

### Checklist de implementação
- [ ] **Spec** `SDD/specs/0033-recuperacao-pagamento-falho.md` (a partir do `_TEMPLATE`).
- [ ] **Schema/migration** — `RecoveryCase`, `RecoveryAttempt` (+ índices por `tenantId`, `nextActionAt`, `status`).
- [ ] **Domínio** — `domain/recovery.ts`: função pura `decideNextStep(caseState, eloSignals, settings)` (testável).
- [ ] **DTO (Zod)** — config da sequência de recuperação por tenant.
- [ ] **Repository** — `recovery-case.repository.ts` (abrir, buscar devidos, avançar, fechar) — escopado por tenant.
- [ ] **Service** — `recovery.service.ts`: abrir caso (ao virar OVERDUE / falha), `advanceDueCases()`, fechar no webhook.
- [ ] **Integração** — ligar no ponto onde a fatura vira `OVERDUE` e no `applyWebhook` (fechar caso).
- [ ] **Worker/rota de sistema** — `recovery.worker.ts` + `POST /api/system/recovery/run` (cronAuth) + cron 11:05.
- [ ] **Canal/alívio** — reusar `resolveChannels` (0032) e disparar `Agreement` (0018) no passo `offer_relief`.
- [ ] **Frontend** — aba/painel "Recuperações" (casos abertos, timeline por caso, botão "encerrar") + card no Cockpit.
- [ ] **Testes** — `decideNextStep` (casos: escalar, trocar canal, ofertar alívio, fechar) + service com repo mockado.
- [ ] **Contexto** — atualizar `fluxo-completo.md` e `overview.md`.

### Critérios de aceite
- [ ] Fatura OVERDUE abre 1 caso (não duplica).
- [ ] Passo com hesitação (Elo) dispara o Botão de Alívio.
- [ ] Falha de canal → próximo passo em outro canal.
- [ ] Pagamento (webhook) fecha o caso como `recovered`.
- [ ] Sem sucesso no fim → `lost` + `outcome`, visível no painel.

---

## F2 · Radar de saúde do cliente (score de risco) ⭐

### Descrição
Cada cliente ganha um **score de saúde (0-100)** e uma **faixa** (`saudável` /
`atenção` / `em risco`) calculados do **dinheiro** (atrasa cada vez mais? pagou
parcial? faltou uma recorrência?) **+ comportamento** (parou de abrir os links?).
É o que permite **avisar antes de perder**. Começa **baseado em regras** (sem ML) e
evolui.

### Cenário
> A **Maria** sempre pagava no dia. Nos últimos 3 meses pagou com 2, depois 5,
> depois 9 dias de atraso, e **parou de abrir** o link de cobrança. O score dela cai
> de 90 para 55 → faixa `em risco`. Ela aparece no topo da fila de ação com o alerta
> *"padrão de atraso crescente + parou de engajar — risco de churn"*, **antes** de
> ela cancelar. No avulso, o mesmo sinal vira *"alta chance de calote nesta
> cobrança — priorize"*.

### Modelo de dados
```prisma
model ClientHealth {
  id          String   @id @default(uuid())
  score       Int      // 0..100
  band        String   // healthy | watch | at_risk
  signals     Json     // { avgDaysLate, trendLate, missedRecurring, opensNoPay, lastPaidAt }
  computedAt  DateTime @default(now())
  clientId    String   @unique
  tenantId    String
}
```

### Regras de negócio
- **RN-F2-01** — Score **v1 por regras** (documentadas e testáveis), não caixa-preta:
  pontos negativos por tendência de atraso, atraso médio, recorrência perdida,
  aberturas-sem-pagar; faixa por limiares.
- **RN-F2-02** — Recalcula em **eventos de pagamento** (webhook/baixa) e num **sweep
  diário**. Persistido para permitir tendência e alimentar a fila (F3).
- **RN-F2-03** — Funciona nos dois modos: recorrente = risco de **churn**; avulso =
  risco de **calote** na cobrança atual.
- **RN-F2-04** — O score é **interno do tenant** (NÃO cruza empresas — isso é F9,
  travado por LGPD).

### Checklist de implementação
- [ ] **Spec** `0034-radar-saude-cliente.md`.
- [ ] **Schema/migration** — `ClientHealth`.
- [ ] **Domínio** — `domain/health-score.ts`: `computeHealth(paymentHistory, eloStats)` pura + testada (tabela de casos).
- [ ] **Repository** — leitura de histórico de pagamento + eventos Elo agregados por cliente; upsert do `ClientHealth`.
- [ ] **Service** — `health.service.ts`: recompute por evento + `recomputeAllForTenant()` (sweep).
- [ ] **Worker/sistema** — juntar ao sweep de F1 (mesmo cron) ou `POST /api/system/health/run`.
- [ ] **Frontend** — badge de saúde no cliente + filtro "em risco" + coluna na lista.
- [ ] **Testes** — `computeHealth` (saudável, atenção crescente, em risco, recém-cadastrado sem histórico).
- [ ] **Contexto** — atualizar `domain-model.md`.

### Critérios de aceite
- [ ] Cliente sem histórico = faixa neutra (não penaliza injustamente).
- [ ] Atraso crescente + queda de abertura → `at_risk`.
- [ ] Recalcula ao registrar um pagamento.

---

## F3 · Fila de ação do dia (decisão, não relatório) ⭐

### Descrição
O Cockpit deixa de mostrar só números e passa a mandar **o que fazer hoje**,
priorizado por **dinheiro em risco** (`amountAtRisk × probabilidade`): *"recupere
essa assinatura · cobre esses 3 · esse cliente vai sair"*. Une três fontes: casos
de recuperação (F1) que precisam de ação, clientes em risco (F2) e vencimentos
próximos.

### Cenário
> Segunda de manhã, o dono abre o painel e vê **7 itens ordenados**: no topo, "assinatura
> do Pedro (R$ 320) falhou — recuperar" (1 clique dispara a ação); depois "Maria em
> risco de churn — contatar"; depois "3 faturas vencem quinta". Ele resolve o dia
> em 5 minutos, começando pelo que mais dói no bolso.

### Modelo de dados
Sem tabela nova (v1): é uma **agregação/consulta** que combina `RecoveryCase`,
`ClientHealth`, `Invoice`. (Evoluir para materialização só se performance exigir.)

### Checklist de implementação
- [ ] **Spec** `0035-fila-de-acao.md` (ou estender o Cockpit, spec 0017).
- [ ] **Service** — `action-queue.service.ts`: monta e prioriza os itens (função de ranking pura testável).
- [ ] **Controller/Router** — estender `GET /api/cockpit/overview` ou `GET /api/cockpit/actions`.
- [ ] **Frontend** — lista priorizada no Dashboard com **ações de 1 clique** (recuperar / cobrar / contatar).
- [ ] **Testes** — ranking (dinheiro em risco ordena corretamente; empates; itens resolvidos somem).

### Critérios de aceite
- [ ] Itens ordenados por dinheiro em risco.
- [ ] Ação de 1 clique dispara o caso de recuperação (F1).
- [ ] Item resolvido sai da fila.

---

# ANEL 2 — Aprofunda o valor (logo depois)

> Descrição + cenário + esboço técnico. Detalhar em spec quando priorizado.

## F4 · Previsão de caixa por pagador
- **Descrição:** projeta *quanto* entra e *quando*, com **confiança**, a partir do
  atraso médio histórico de **cada** pagador (não uma média cega).
- **Cenário:** *"entram ~R$ 4.200 até sexta (85% de confiança); R$ 900 estão em
  risco"* — o dono planeja o caixa.
- **Esboço:** service de agregação sobre `Invoice`/`Payment`; atraso médio + desvio
  por cliente → data provável e intervalo de confiança. Endpoint
  `GET /api/cockpit/forecast`. Sem tabela nova. Frontend: gráfico simples.
- **Checklist resumido:** [ ] service de projeção (puro/testável) · [ ] endpoint ·
  [ ] card no Cockpit · [ ] testes de cálculo.

## F5 · Winback / reativação automática
- **Descrição:** cliente perdido (`RecoveryCase.lost` ou assinatura `CANCELED`) entra
  numa **sequência de retorno** (oferta de volta). Fecha o ciclo de retenção.
- **Cenário:** 15 dias após o João sair, ele recebe *"sentimos sua falta — volte com
  10% no 1º mês"*; se retornar, reativa a assinatura.
- **Esboço:** reusar `RecoveryCase` com `reason=churned` **ou** `WinbackCampaign`;
  gatilho no fechamento `lost`/`CANCELED`; sequência no mesmo worker de recuperação.
- **Checklist resumido:** [ ] gatilho de entrada · [ ] sequência de winback ·
  [ ] métrica "clientes reativados" · [ ] frontend campanha.

## F6 · PIX Automático (mata a fricção do recorrente na origem)
- **Descrição:** débito recorrente autorizado **uma vez** pelo pagador (padrão do
  BC) — em vez de recuperar a falha, ela quase não acontece.
- **Cenário:** o aluno autoriza no 1º pagamento; nos meses seguintes o valor é
  debitado sozinho, sem link, sem lembrete, sem atraso.
- **Esboço:** depende de **suporte do gateway** ao PIX Automático. `PaymentMandate`
  (mandato por assinatura, cifrado); `SubscriptionService.run` cobra via mandato
  quando existir. **Dependência externa** (gateway) — validar antes.
- **Checklist resumido:** [ ] confirmar suporte no gateway do tenant · [ ] modelo
  `PaymentMandate` · [ ] fluxo de autorização · [ ] cobrança via mandato no scheduler.

## F7 · NFS-e automática (matador no nicho de serviço)
- **Descrição:** ao receber, **emite a nota fiscal de serviço sozinho**.
- **Cenário:** a clínica recebe do paciente → a NFS-e é emitida na prefeitura e
  enviada, sem ninguém abrir o site da prefeitura.
- **Esboço:** integrar **provider de NFS-e** (PlugNotas/Focus/eNotas — nunca a
  prefeitura na mão). `FiscalSetting` por tenant (CNPJ, regime, código de serviço,
  cifrado); `FiscalDocument` por fatura; gatilho no `PAID` (webhook). Integração
  **pesada** + custo por nota. Só vale no nicho de serviço.
- **Checklist resumido:** [ ] escolher provider · [ ] `FiscalSetting`/`FiscalDocument`
  · [ ] seam `apis/nfse` (mock-first, como os outros) · [ ] gatilho no webhook ·
  [ ] tela de config fiscal.

---

# PILARES — Retenção, Acesso e Contrato (o que dá "dente" ao motor)

## F11 · Retenção no cancelamento (Modo Salvar) ⭐

### Descrição
Churn **voluntário**: quando o cliente **quer** cancelar, o sistema roda um fluxo de
retenção **antes** de efetivar — pergunta o motivo e oferece uma saída sob medida
(**pausar**, desconto, downgrade, voltar depois). Completa a tríade do churn:
F1 = involuntário (quer continuar, mas o pagamento falhou) · **F11 = voluntário** ·
F5 = já saiu (winback).

### Cenário
> O mensalista clica em "cancelar". Em vez de cancelar direto, o sistema responde:
> *"Que tal **pausar por 2 meses**? Sua vaga fica guardada"* — ou *"volte com 30% no
> próximo mês"*. Boa parte que ia sair por aperto/preguiça fica.

### Modelo de dados
```prisma
model CancellationRequest {
  id           String   @id @default(uuid())
  reason       String?  // preco | nao_uso | mudanca | insatisfacao | outro
  status       String   @default("open") // open | saved | cancelled
  saveOffer    String?  // pause | discount | downgrade | winback_later
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
  clientId     String
  subscriptionId String?
  tenantId     String
}
```

### Regras de negócio
- **RN-F11-01** — Pedir cancelamento **abre** um fluxo; a oferta depende do **motivo**
  e do valor/saúde do cliente (F2). **Pausar** é preferido a desconto (retém sem
  perder margem).
- **RN-F11-02** — Registrar quem foi **salvo** e por qual oferta (aprendizado + métrica).
- **RN-F11-03** — Respeitar o contrato (F14): fidelidade/multa só se assinadas.

### Checklist de implementação
- [ ] **Spec** `SDD/specs/00xx-retencao-cancelamento.md`.
- [ ] **Schema/migration** — `CancellationRequest`.
- [ ] **Domínio** — `domain/save-offer.ts`: `decideSaveOffer(reason, health, contract)` pura/testável.
- [ ] **Service** — abrir fluxo, aplicar oferta (pausar/descontar), resolver.
- [ ] **Rota/Portal** — "solicitar cancelamento" na área do cliente.
- [ ] **Frontend** — fluxo de cancelamento com a oferta + painel de "salvos".
- [ ] **Testes** — cada motivo → oferta certa; salvo vs. cancelado.

---

## F12 · Camada de Acesso — pagou libera / não pagou bloqueia ⭐

### Descrição
O **status de pagamento controla o acesso** ao serviço (liberado / bloqueado /
suspenso). É o **estado**; a porta que os aparelhos usam para agir é o **F13**.
É o motivador de pagamento mais forte que existe.

### Cenário
> O aluno atrasa 5 dias e o F1 não recupera → o estado vira **bloqueado** → a catraca
> não abre. Pagou → **liberado** na hora.

### Modelo de dados
```prisma
model AccessState {
  id         String   @id @default(uuid())
  state      String   @default("allowed") // allowed | blocked | suspended
  reason     String?  // overdue | manual | contract_end
  changedAt  DateTime @default(now())
  clientId   String
  subscriptionId String?
  tenantId   String
}
```

### Regras de negócio
- **RN-F12-01** — O estado é **derivado** do status de pagamento / `RecoveryCase`.
- **RN-F12-02** — **Nunca** bloquear quem está em dia (erro grave — robustez/testes).
- **RN-F12-03** — Bloqueio só com **contrato (F14)** que o preveja e só para serviço
  **NÃO essencial** (academia/streaming sim; escola/saúde **não** — ver `docs/lgpd.md`).
- **RN-F12-04** — Toda mudança de estado é **logada** e dispara webhook de saída (F13).

### Checklist de implementação
- [ ] **Spec** `SDD/specs/00xx-camada-acesso.md`.
- [ ] **Schema/migration** — `AccessState` (+ índice por cliente/tenant).
- [ ] **Service** — deriva o estado dos eventos de pagamento/recuperação; expõe consulta.
- [ ] **Integração** — dispara webhook de saída (F13) em cada mudança.
- [ ] **Frontend** — ver/forçar estado por cliente; nota do limite legal.
- [ ] **Testes** — **jamais** bloquear pago; overdue → blocked; pagamento → allowed.

---

## F13 · API Pública + Webhooks de Saída (a "tomada" — catracas / IoT / streaming) ⭐

### Descrição
A porta padronizada onde **sistemas e aparelhos externos se conectam**. Duas partes:
1. **Webhooks de saída:** o Adimplo **avisa** eventos (`invoice.paid`,
   `access.blocked`, `access.allowed`…) para o sistema do parceiro.
2. **API pública** (chave por tenant): o parceiro **consulta/age** ("esse cliente
   pode entrar?"). O Adimplo entrega a **decisão**; o aparelho executa.

### Cenário
> A catraca pergunta à API *"aluno X pode entrar?"* → resposta pelo `AccessState`.
> Ao pagar, o Adimplo dispara `access.allowed` para o software da academia, que
> libera a catraca — tudo automático.

### Esboço técnico
`ApiKey` por tenant (cifrada); webhooks assinados por **HMAC** com **retry**;
catálogo de eventos versionado; API pública em `/v1/*`. **Comece pelo webhook/API
genérico**; conectores de marca (software de academia X) só sob demanda.

### Checklist de implementação
- [ ] **Spec** `SDD/specs/00xx-api-publica-webhooks.md`.
- [ ] **Schema** — `ApiKey` (cifrada, escopo por tenant).
- [ ] **Emissor de webhooks de saída** — fila + retry + assinatura HMAC + catálogo de eventos.
- [ ] **API pública** — endpoints `/v1` autenticados por chave (rate-limited).
- [ ] **Doc** — OpenAPI/Swagger para integradores (PR-18).
- [ ] **Testes** — assinatura, retry, escopo por tenant.

---

## F14 · Contrato & Assinatura Digital (fundação legal) ⭐

### Descrição
O pagador **assina digitalmente** o contrato de adesão **antes de começar**; o aceite
fica com **prova** (data, versão, trilha de auditoria). Dá **lastro legal** para
cobrar (F1), bloquear acesso (F12) e reter (F11).

### Cenário
> O aluno se matricula → recebe o contrato no celular (12 meses, valor, fidelidade,
> "atraso de 7 dias suspende o acesso") → **assina em 10 segundos** → tudo registrado.

### Nível de assinatura
- **Leve (começar):** aceite eletrônico com trilha de prova — **reusa o padrão já
  existente** (`Account.acceptedTermsAt`/`acceptedTermsVersion`), agora para o pagador.
  Válido no Brasil (Lei 14.063/2020) para adesão B2C.
- **Forte (depois):** seam para provedor (Clicksign/ZapSign/D4Sign), sem reescrever.

### Modelo de dados
```prisma
model ContractTemplate {
  id        String   @id @default(uuid())
  name      String
  body      String   // texto com variáveis {nome} {valor} {plano}
  version   Int      @default(1)
  active    Boolean  @default(true)
  tenantId  String
}
model ContractSignature {
  id         String   @id @default(uuid())
  version    Int
  signedAt   DateTime @default(now())
  evidence   Json     // { ipHash?, ua?, method }
  clientId   String
  templateId String
  tenantId   String
}
```

### Checklist de implementação
- [ ] **Spec** `SDD/specs/00xx-contrato-assinatura.md`.
- [ ] **Schema** — `ContractTemplate`, `ContractSignature`.
- [ ] **Seam** `apis/esign` (default simples/leve; provider real depois).
- [ ] **Rota/Portal** — enviar + assinar o contrato (área do pagador).
- [ ] **Frontend** — criar/editar modelo (dono) + tela de assinatura (pagador).
- [ ] **Testes** — aceite gera assinatura com prova; versão correta.
- [ ] **⚠️ Jurídico** — modelos de contrato (fidelidade/multa — limites do CDC) validados pelo advogado (ver `docs/lgpd.md`).

---

# ANEL 3 — Moat de longo prazo

## F8 · Adimplência premiada
- **Descrição:** quem paga em dia ganha (desconto/cashback/selo). Inverte o jogo —
  cobra **premiando**, não punindo; casa com o nome "Adimplo" e segura cliente.
- **Cenário:** 6 meses pagando em dia → "selo bom pagador" + 5% no próximo mês.
- **Esboço:** regra de recompensa por pontualidade aplicada na geração da cobrança;
  histórico de pontualidade → selo (reusa `Payment`/`ClientHealth`).

## F9 · Score de reputação entre empresas (cross-tenant)
- **Descrição:** o efeito-rede — reputação que **viaja** entre tenants (mesmo pagador
  por CPF/telefone). O moat de dados mais difícil de copiar.
- **Cenário:** um novo cliente chega com um "score Adimplo" já formado por
  comportamento em outras empresas da rede.
- **⚠️ BLOQUEIO:** exige **base legal LGPD** desenhada **antes** de codar (ver
  `docs/lgpd.md`, P11 — Lei do Cadastro Positivo). **Não implementar sem advogado.**
- **Esboço (futuro):** identidade `Payer` por CPF/telefone; score agregando
  comportamento entre tenants com consentimento/base legal definida.

## F10 · Omnichannel por taxa de abertura
- **Descrição:** o sistema **escolhe o canal** conforme quem lê onde (taxa de
  abertura/entrega por cliente).
- **Cenário:** a Maria nunca abre e-mail mas lê WhatsApp na hora → o sistema passa a
  priorizar WhatsApp para ela sozinho.
- **Dependência:** **webhook de status de entrega** (sent/delivered/read/failed) —
  dívida **D-02**. Usa os eventos do Elo já modelados (`delivered`/`read`).

---

# ANEL DE CRESCIMENTO — fazer a receita CRESCER (não só proteger)

> Os anéis e pilares acima **protegem** a receita (recupera, retém, cobra, controla
> acesso). Este grupo a faz **crescer**. Um produto que protege **E** faz crescer é
> muito mais difícil de largar — e justifica cobrar mais caro.

## F15 · Loja no Pagamento (vender junto / order bump) ⭐

### Descrição
A página de pagamento — que **já é sua** (o Elo, `/pagar/:token`) — vira **vitrine**:
oferece um extra/upgrade no checkout, comprável em 1 toque. Gera **receita nova**
onde a atenção do cliente já está.

### Cenário
> O aluno abre o PIX da mensalidade e vê *"+ personal 1x/semana por R$ 60"* ou
> *"leve 3 meses com 10% off"*. Aceita com 1 toque. O dono faturou a mais **sem
> vender nada na mão.**

### Modelo de dados
```prisma
model OfferProduct {
  id       String  @id @default(uuid())
  name     String
  priceCents Int
  type     String  // addon | upgrade | produto
  active   Boolean @default(true)
  tenantId String
}
```

### Checklist de implementação
- [ ] **Spec** `SDD/specs/00xx-loja-no-pagamento.md`.
- [ ] **Schema** — `OfferProduct`.
- [ ] **Service** — anexar oferta ao checkout; ao aceitar, gerar cobrança do add-on.
- [ ] **Frontend** — config de ofertas (dono) + vitrine na página `/pagar`.
- [ ] **Métrica** — receita extra gerada pela loja.
- [ ] **Testes** — aceitar oferta cria a cobrança correta.

*Maior ROI pelo menor esforço — a página já existe.*

## F16 · Indique e Ganhe (indicação)
- **Descrição:** o cliente indica um amigo; os dois ganham bônus; o dono ganha
  **cliente novo quase de graça**.
- **Cenário:** a Maria manda o link; a amiga assina; as duas ganham 15% no próximo mês.
- **Esboço:** `Referral` (indicadorClientId, indicadoClientId, status, recompensa) +
  código/link por cliente; atribuição na conversão; crédito automático.
- **Checklist:** [ ] `Referral` · [ ] link/código no portal · [ ] atribuição na
  conversão · [ ] crédito automático · [ ] frontend · [ ] testes.

## F17 · Pacotes e Créditos (pré-pago / wallet)
- **Descrição:** vender pacote/créditos **à vista**; o cliente consome; o dono recebe
  **caixa agora**. Liga no acesso (F12): consumir crédito = entrar.
- **Cenário:** a clínica vende "10 fisioterapias"; recebe tudo; o sistema baixa a cada
  uso e oferece renovar ao zerar.
- **Esboço:** `CreditWallet` (saldo por cliente) + `CreditLedger` (entradas/consumos).
- **Checklist:** [ ] `CreditWallet`/`CreditLedger` · [ ] comprar pacote · [ ] consumir
  crédito (liga no F12) · [ ] frontend saldo/extrato · [ ] testes.

## F18 · Autoatendimento do consumidor
- **Descrição:** o pagador resolve sozinho no portal (troca cartão/vencimento, baixa
  recibo/nota, vê histórico) — **sem ligar pro dono**. Derruba o suporte do dono.
- **Cenário:** o cliente muda o dia do vencimento sozinho às 23h.
- **Esboço:** estender o **Portal do pagador** (spec 0027) com ações self-service
  autenticadas pelo token do portal.
- **Checklist:** [ ] endpoints self-service · [ ] área do cliente no portal · [ ] testes.

---

## 4. Plano de implementação (faseado)

> **Regra de ouro:** 1 feature = 1 **spec** (`0033+`) = 1 **PR**, com **teste antes de
> commitar** — o processo de sempre do SDD. Cada fase entrega valor sozinha, dá uma
> **demo vendável** e prepara a próxima. Primeiro o motor **protege**; no fim, **faz
> crescer**.

| Fase | Foco | Features | Por que agora / marco |
|---|---|---|---|
| **1** | **O Coração** | F1 Resgate → F2 Radar + F3 Lista do Dia | Usa o que já existe, ataca o maior valor (churn), **demonstrável com número**. Marco: demo *"recuperei R$ X"*. |
| **2** | **Ganhos rápidos** | F14 Contrato Digital · F15 Loja no Pagamento | Contrato é barato (reusa o aceite) e **destrava** F11/F12; a Loja é o **maior ROI/menor esforço**. Marco: base legal + 1ª receita nova. |
| **3** | **Retenção completa** | F11 Modo Salvar · F5 Winback · F16 Indique e Ganhe | Fecha a **tríade do churn** e cresce por indicação. Marco: % de clientes salvos/reativados. |
| **4** | **Acesso & Integrações (o "grude")** | F13 API + Webhooks → F12 Camada de Acesso | Exige **robustez** (bloquear quem pagou = grave) + nota legal. Marco: 1º conector real (catraca/software de academia). |
| **5** | **Recorrência forte / fiscal / pré-pago** | F6 PIX Automático **ou** F7 NFS-e · F17 Pacotes e Créditos | Escolher pela **cara do 1º cliente** (recorrente → PIX Auto; prestador → NFS-e). |
| **6** | **Refino & longo prazo** | F18 Autoatendimento · F4 Previsão · F8 Adimplência premiada · F10 Melhor canal · F9 Score (só após jurídico) | Polimento e moat de dados. |

### Toques que dependem do advogado (junto do pacote LGPD — `docs/lgpd.md`)
- **F14** — cláusulas do contrato (fidelidade/multa: limites do CDC).
- **F12** — limite de bloqueio (só serviço **não essencial**).
- **F9** — score entre empresas (Lei do Cadastro Positivo) — **não codar antes**.

### Próximo passo concreto
Escrever a **spec `0033-recuperacao-pagamento-falho.md`** (F1) no template do SDD e
começar a implementar. É o "coração" e o de maior valor demonstrável.

### Mapa rápido: proteger × crescer
- **Protegem a receita:** F1, F2, F3, F5, F11, F12, F13, F4, F8, F10.
- **Fazem crescer a receita:** F15, F16, F17 (e F14 como base legal; F18 reduz custo).
</content>
