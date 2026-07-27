# Spec 0046 — Indique e Ganhe (indicação) — F16

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-27
- **Relacionada**: 0016 (Elo/link), 0015 (webhook — conversão no PAID), 0009
  (recorrência — crédito na próxima fatura), 0044/0045 (padrão de cobrança/crédito).
  Roadmap: `motor-protecao-receita.md` (**F16** — crescimento por indicação).

## 1. Problema / Motivação

O sistema recupera, retém e reativa — mas não cresce por **indicação**. Falta um
mecanismo de aquisição orgânica: o cliente satisfeito trazer amigos, com incentivo
para os dois. É o canal de crescimento mais barato para o piloto.

## 2. Objetivo

Cada cliente ganha um **link de indicação**. O amigo se cadastra por ele (captura
pública); quando **converte** (paga a 1ª fatura), os dois ganham um **crédito
automático** na próxima cobrança. O dono ganha cliente novo quase de graça.

Fora do v1: ranking de indicadores, campanhas com prazo, níveis de recompensa,
antifraude avançado, crédito percentual.

## 3. Regras de negócio

- **RN-4601** — Cada `Client` tem um `referralCode` único (gerado sob demanda,
  alfabeto sem caracteres ambíguos). Link público: `/indicar/:code`.
- **RN-4602 (captura pública)** — `POST /api/public/referrals/:code` resolve tenant +
  indicador pelo código (cross-tenant), cria o **cliente indicado** (lead atribuído,
  `referredByClientId`) e a `Referral` (pending). Exige o programa **ativo**; recusa
  telefone que já é cliente (dedupe por tenant).
- **RN-4603 (conversão)** — Quando o indicado paga a **1ª fatura** (webhook PAID),
  a `Referral` pendente vira `converted` e concede o bônus. Idempotente (1 por
  indicado, só a 1ª conversão concede).
- **RN-4604 (recompensa)** — Crédito fixo em centavos por pessoa (`rewardCents`),
  para `rewardWho` (`both` | `referred` | `referrer`) — `rewardFor` (puro). Somado a
  `Client.referralCreditCents`.
- **RN-4605 (crédito na fatura)** — Na geração da próxima cobrança (recorrente ou
  avulsa), o crédito abate o valor (`netAfterCredit`, puro) e é **consumido** só após
  a cobrança criada. **Trava anti-cobrança-zero:** só abate quando sobra valor
  positivo; senão o crédito fica guardado. Um item negativo reconcilia o total.
- **RN-4606** — Escopo por tenant. Programa gated por `ReferralSetting.enabled`.

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260815000000_indique_e_ganhe`):
```prisma
// Client ganha: referralCode String? @unique · referredByClientId String? · referralCreditCents Int @default(0)
model ReferralSetting { tenantId String @unique; enabled Boolean; rewardCents Int @default(1000); rewardWho String @default("both") }
model Referral {
  status String @default("pending") // pending | converted
  rewardCents Int; convertedAt DateTime?
  referrerClientId String; referredClientId String @unique; tenantId String
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET /api/referrals/settings   → { enabled, rewardCents, rewardWho }
PUT /api/referrals/settings   { enabled?, rewardCents?, rewardWho? }
GET /api/referrals/summary    → { total, pending, converted, rewardCents }
GET /api/referrals            → [ { referrerName, referredName, status, ... } ]
GET /api/referrals/code/:clientId → { code, link }   (gera na 1ª vez)

# Público (link de indicação, sem JWT — tenant pelo código)
GET  /api/public/referrals/:code   → { referrerName, enabled, rewardCents }
POST /api/public/referrals/:code   { name, phone } → 201 (cria lead + Referral)
```

## 6. Fluxo

- Dono ativa em Configurações → Indique e Ganhe (bônus + quem ganha). Cada cliente
  tem um link (botão 🎁 na tela de Clientes).
- Cliente manda o link → amigo abre `/indicar/:code` → deixa nome+telefone → vira
  cliente (lead) + `Referral` pending.
- Dono cobra o amigo (assinatura/fatura). Amigo **paga a 1ª** → webhook PAID →
  `ReferralService.onInvoicePaid` converte e credita os dois.
- Na **próxima fatura** de cada um, o crédito abate o valor automaticamente.

## 7. Camadas afetadas

- [x] Schema/migration — `Client.referralCode/referredByClientId/referralCreditCents`, `ReferralSetting`, `Referral`.
- [x] Domínio — `src/domain/referral.ts` (`netAfterCredit`, `rewardFor`, clamps) + testes.
- [x] Repository — `referral.repository.ts` (código, referral, crédito, settings, list, summary).
- [x] Service — `referral.service.ts` (ensureCode, publicInfo, capture, onInvoicePaid, credit helpers).
- [x] Integração — `InvoiceService`: `applyReferralCredit` (create/subscription) + conversão no `applyWebhook` PAID.
- [x] Controller/Router — `/api/referrals` (JWT) + `/api/public/referrals` (público).
- [x] Frontend — página pública `/indicar/:code`; Configurações → Indique e Ganhe; botão 🎁 na lista de Clientes.
- [x] Testes — domínio (4) + serviço (10) + invoice.service (mock referrals via `.catch`).
- [x] Contexto — `domain-model.md`, `motor-protecao-receita.md`.

## 8. Critérios de aceite

- [x] Link público captura o amigo (lead + Referral); recusa desativado / telefone repetido.
- [x] 1º pagamento do indicado converte e credita os dois conforme `rewardWho`.
- [x] Crédito abate a próxima fatura só quando sobra valor positivo (anti-cobrança-zero).
- [x] Suíte verde (462) + build limpo.

## 9. Notas de implementação

O crédito é consumido só após a cobrança criada (rollback do gateway não perde
crédito). v1 documenta: crédito ≥ fatura fica guardado (não gera cobrança de R$0).
Follow-up **F16.1**: crédito percentual, ranking, campanhas, antifraude.
