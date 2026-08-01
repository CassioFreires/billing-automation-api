# Spec 0053 — Alinhar cobrança ao modelo modular (preços + assentos)

- **Status**: Implementada
- **Autor**: Cassio (via agente)
- **Data**: 2026-07-28
- **Relacionada**: 0020 (planos), 0051 (modularização), 0030 (equipe)

## 1. Problema / Motivação

A landing passou a comunicar o **modelo modular** (Núcleo + módulos + assentos), mas o
motor de cobrança (`plans.ts`) ainda tinha preços antigos (Pro R$199) e **não havia
limite de usuários**. O "3 usuários / +R$19" era só texto. Faltava a alavanca de
expansão que o negócio pediu: **serviços mínimos com limites que empurram o upgrade**.

## 2. Objetivo

Alinhar o sistema à landing: repreçar o Núcleo e implementar **limite de assentos
(usuários) por plano**, bloqueando o convite acima dos inclusos. **Fora de escopo:**
cobrança automática do assento/módulo extra (segue manual/assistida no piloto);
enforcement de limite de clientes (número no catálogo é orientativo por ora).

## 3. Regras de negócio

- **RN-P1** — Catálogo do Núcleo: `free` "Núcleo Grátis" (R$0, 30 faturas/mês, **1
  assento**), `essencial` "Núcleo Essencial" (R$49, 200 faturas, **2 assentos**),
  `pro` "Núcleo Pro" (R$97, faturas ilimitadas, **3 assentos**).
- **RN-P2** — `Entitlements` ganha `maxSeats` (assentos do plano efetivo; no trial vale Pro).
- **RN-P3** — Convidar usuário além dos assentos inclusos → `402 { code: 'SEAT_LIMIT' }`.
  Só bloqueia o **convite**; usuários existentes acima do limite (ex.: após downgrade)
  não são removidos.
- **RN-P4** — `GET /billing/plan` passa a devolver `usage.seatsUsed` e `usage.maxSeats`.
- **RN-P5** — Assento adicional custa `EXTRA_SEAT_PRICE_CENTS` (R$19) — informativo (a
  cobrança avulsa é follow-up).

## 4. Impacto no modelo de dados

Nenhuma migration. Só lógica em `src/domain/plans.ts` (campo `maxSeats` no catálogo e
nos entitlements). Contagem de assentos = `count(User where tenantId)`.

## 5. Contrato de API

```
POST /api/team  (OWNER/ADMIN)
  ... estoura assentos → 402 { error, code: 'SEAT_LIMIT' }

GET /api/billing/plan
  usage: { invoicesThisMonth, maxInvoicesPerMonth, overQuota, seatsUsed, maxSeats }
```

## 6. Camadas afetadas

- [x] Domínio — `plans.ts` (repreço, `maxSeats`, `isOverSeatLimit`)
- [x] Service — `team.service` (gate no invite), `platform-subscription.service` (seats no getStatus)
- [x] Controller — `team.controller` (SEAT_LIMIT → 402)
- [x] Repository — `user.repository.countByTenant`
- [x] Front — `billing.service` (tipos), `TeamPage` (contador + upsell)
- [x] Testes — plans/team/admin/platform ajustados + novo teste de SEAT_LIMIT

## 7. Critérios de aceite

- [x] Plano free inclui 1 assento; convidar o 2º → 402 SEAT_LIMIT.
- [x] `GET /billing/plan` devolve `seatsUsed`/`maxSeats`.
- [x] Preço do Pro = R$97 no catálogo e no checkout.
- [x] Suíte verde (492 testes).

## 8. Notas de implementação

- O gate do Botão de Alívio continua no módulo `recovery` (spec 0051); `reliefButton`
  do plano é legado de exibição.
- Limite de clientes por plano: mostrado na landing como porte, ainda **não** enforced.
- Próximo: cobrança real do assento/módulo extra (integrar ao checkout de plataforma).
