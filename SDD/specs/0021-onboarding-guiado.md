# Spec 0021 — Onboarding guiado (primeiro acesso → 1ª cobrança)

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Dívida relacionada**: —

## 1. Problema / Motivação

Um dono que acaba de criar a conta cai direto no Cockpit vazio e não sabe por onde
começar (foi exatamente o sintoma do "embolado"). Sem um caminho claro do zero até a
**primeira cobrança**, o trial de 14 dias (spec 0020) não converte: a pessoa não chega
ao "aha" (ver a cobrança sair) antes do teste acabar.

Precisamos de um **onboarding guiado** que mostre, no primeiro acesso, os poucos passos
que levam a conta a estar operante — e que suma sozinho quando a conta já está pronta.

## 2. Objetivo

Entregar um **checklist de ativação por tenant**, derivado de dados reais da conta, que
guia o dono por 4 passos até emitir a 1ª cobrança, com deep-links que abrem a ação certa.

- **Em escopo:** estado de onboarding por tenant (derivado + dispensa/pular), endpoint de
  status, card de checklist no Dashboard, banner de progresso no shell, deep-links que
  auto-abrem os modais de "novo cliente" e "nova cobrança".
- **Fora de escopo:** tour interativo/tooltips passo-a-passo nas telas; e-mails de
  onboarding; vídeos. Gateway/WhatsApp **reais** seguem fora (mock) — ver tech-debt.

**Preparado para produção por construção:** o progresso é lido de **sinais reais** (existe
gateway configurado? existe cliente? existe fatura?). Quando um provedor real for ligado
no futuro, os passos continuam válidos sem reescrever nada.

## 3. Regras de negócio

- **RN-2101** — O progresso do onboarding é **por tenant** e **derivado de dados reais**:
  gateway configurado, WhatsApp configurado ou pulado, ≥1 cliente, ≥1 fatura.
- **RN-2102** — Passos são de dois tipos: **obrigatórios** (gateway, cliente, cobrança) e
  **opcionais** (WhatsApp). Um passo opcional pode ser **pulado**, e o "pulo" é persistido.
- **RN-2103** — O passo "Configurar recebimento" está **completo com qualquer gateway
  salvo**, inclusive o `mock` (Simulado). Isso mantém o passo válido quando um provedor
  real for configurado depois (prod-ready).
- **RN-2104** — O onboarding é **completo** quando todos os passos obrigatórios estão
  feitos **e** o passo opcional está feito ou pulado. Completo ⇒ banner e card somem.
- **RN-2105** — O dono pode **dispensar** o checklist manualmente (`dismissed`). Dispensado
  ⇒ card e banner somem, mesmo incompleto. É persistido por tenant.
- **RN-2106** — O status é **somente leitura + dispensa/pular**; **não** tem gating de
  plano. Precisa funcionar no trial, no Free e **mesmo com a escrita bloqueada** (paywall,
  spec 0020) — é justamente quem precisa de orientação.
- **RN-2107** — A ordem sugerida respeita a dependência real: **cliente antes de cobrança**
  (o formulário de fatura já exige ao menos um cliente).

## 4. Impacto no modelo de dados

Nova entidade 1:1 por tenant, no padrão dos demais settings (ver `context/domain-model.md`):

```prisma
model OnboardingState {
  id              String   @id @default(uuid())
  dismissed       Boolean  @default(false) // dono fechou o checklist manualmente
  whatsappSkipped Boolean  @default(false) // pulou o passo opcional de WhatsApp
  createdAt       DateTime @default(now())
  lastUpdate      DateTime @updatedAt
  tenantId        String   @unique
  account         Account  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

- Back-relation `onboardingState OnboardingState?` no `Account`.
- Migration **aditiva e idempotente** `20260726000000_onboarding_state` (CREATE TABLE IF
  NOT EXISTS + unique index + guarda de FK), no mesmo estilo das anteriores.
- O restante do estado (passos feitos) é **derivado** — não há colunas para isso.
- Não é preciso criar a linha no cadastro: quando ausente, o status assume defaults
  (`dismissed=false`, `whatsappSkipped=false`). A linha só nasce ao dispensar/pular.

## 5. Contrato de API

Montado em `/api/onboarding`, exige JWT de tenant (como os demais).

```
GET /api/onboarding
Response: 200 {
  completed: boolean,
  dismissed: boolean,
  progress: { done: number, total: number },     // total = obrigatórios + opcionais
  steps: [
    { key: 'gateway'  , title, description, done, optional:false, cta:{label, to} },
    { key: 'whatsapp' , title, description, done, optional:true , skipped, cta:{...} },
    { key: 'client'   , title, description, done, optional:false, cta:{label, to} },
    { key: 'invoice'  , title, description, done, optional:false, cta:{label, to} },
  ]
}
```

```
PATCH /api/onboarding
Request:  { dismiss?: boolean, skipWhatsapp?: boolean }   // ao menos um campo
Response: 200 <mesmo corpo do GET>  |  400 { error }
```

Validação Zod (`onboarding.dto.ts`): ambos opcionais, mas exige pelo menos um presente.

## 6. Fluxo / Processamento

1. `GET /api/onboarding` → `OnboardingService.getStatus()`:
   - Lê a linha `OnboardingState` (ou defaults se ausente).
   - Em paralelo (padrão do Cockpit), deriva os sinais via repositório:
     `hasPaymentSetting`, `hasWhatsappSetting`, `hasClients`, `hasInvoices`.
   - Monta os 4 passos, calcula `done` de cada um, `progress` e `completed` (RN-2104).
2. `PATCH` → `dismiss()`/`skipWhatsapp()` fazem `upsert` da linha e devolvem o status novo.
3. Frontend: `useOnboarding()` busca o status; `OnboardingChecklist` (Dashboard) e
   `OnboardingBanner` (AppShell) se escondem quando `completed || dismissed` (RN-2104/05).
   CTAs deep-linkam: `/settings` (gateway/WhatsApp), `/clients?new=1`, `/invoices?new=1`.

## 7. Camadas afetadas

- [x] DTO — `src/dtos/onboarding.dto.ts`
- [x] Repository — `src/repositories/onboarding.repository.ts`
- [x] Service — `src/services/onboarding.service.ts`
- [x] Controller — `src/controllers/onboarding.controller.ts`
- [x] Router — `src/routers/onboarding.router.ts` (montado em `index.ts`)
- [x] Schema Prisma / migration `20260726000000_onboarding_state`
- [x] Seed — marca o tenant demo como `dismissed` (já tem clientes/faturas)
- [x] Frontend — `services/onboarding.service.ts`, `hooks/useOnboarding.ts`,
      `components/Onboarding/OnboardingChecklist.tsx`, banner no `AppShell`, auto-abrir
      modal em Clients/Invoices via query param.

## 8. Critérios de aceite

- [ ] Conta nova (sem gateway, sem cliente, sem fatura) → `GET /onboarding` retorna 4
      passos, todos `done:false`, `progress.done=0`, `completed:false`.
- [ ] Salvar um gateway (inclusive Simulado) → passo `gateway.done=true`.
- [ ] Criar um cliente → `client.done=true`; criar uma fatura → `invoice.done=true`.
- [ ] `PATCH { skipWhatsapp:true }` → `whatsapp.done=true` e `skipped:true`.
- [ ] Todos obrigatórios feitos + WhatsApp feito/pulado → `completed:true`; checklist e
      banner somem no front.
- [ ] `PATCH { dismiss:true }` → `dismissed:true`; some no front mesmo incompleto.
- [ ] Funciona com a conta em paywall (escrita bloqueada) — status é leitura.
- [ ] Demo (`demo@autocore.app`) não mostra o checklist (dispensado no seed).

## 9. Riscos / considerações

- **Sem gating (RN-2106):** intencional — não pode bloquear a orientação. O endpoint só lê
  e grava flags de UI; não abre nenhuma ação de escrita de negócio.
- **Derivação barata:** 4 `count/exists` por request, todos indexados por `tenantId`.
  Cacheável no front (staleTime padrão 60s) e invalidado após criar cliente/fatura.
- **Prod-ready:** gateway "done" para qualquer provider evita retrabalho ao ligar o real.

## 10. Notas de implementação

- **Estado mínimo:** só `dismissed` e `whatsappSkipped` na tabela; o resto é derivado
  via `exists` por tenant (`OnboardingRepository`). A linha nasce apenas no 1º PATCH —
  contas novas funcionam sem linha (defaults).
- **UI dupla, sem duplicar nag:** `OnboardingChecklist` (card completo) no topo do
  Dashboard + `OnboardingBanner` (faixa slim) no `AppShell`, que **some no `/dashboard`**
  para não repetir o card. Ambos escondem em impersonação e ao concluir/dispensar.
- **Deep-link:** `/clients?new=1` e `/invoices?new=1` auto-abrem o modal de criação e
  limpam o query param (`replace`) para não reabrir ao recarregar.
- **Mutação otimista de leitura:** `useUpdateOnboarding` grava o status devolvido no cache
  (`setQueryData`) — sem refetch extra ao dispensar/pular.
- **Prod-ready:** o passo `gateway` fica `done` para qualquer provider salvo (incl. mock);
  quando um provedor real for ligado (D-23), o passo continua válido sem mudança.
- **Testes:** 12 casos (service + DTO). Suíte da API: 263 verdes. Front: `tsc -b` + build OK.
- **Follow-ups possíveis:** carimbar `completedAt` para a métrica "tempo até 1ª cobrança"
  (útil para a spec 0025); tour/tooltips nas telas (fora de escopo aqui).
