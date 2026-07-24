# Spec 0044 — Loja no Pagamento (order bump no checkout) — F15

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0016 (Elo — página `/pagar/:token`), 0018 (autonegociação — reusa o
  padrão reserva→cobra→anexa), 0015 (pagamentos/webhook). Roadmap:
  `motor-protecao-receita.md` (**F15** — o 1º "fazer crescer").

## 1. Problema / Motivação

A página de pagamento (o Elo, `/pagar/:token`) já concentra a **atenção** do cliente
no momento de comprar. Hoje ela só cobra a fatura. É o melhor lugar para oferecer um
**extra** (add-on/upgrade/produto) — receita nova sem esforço de venda, onde a
intenção de pagar já existe.

## 2. Objetivo

Transformar o checkout numa **vitrine** ("order bump"): o dono cadastra ofertas; o
cliente vê e aceita em 1 toque; o Adimplo **gera uma cobrança separada** do extra
(reusa toda a infra de fatura/pagamento). Métrica de receita extra para o dono.

Fora do v1: estoque, variações, cupom, split de recebedor, somar na fatura atual.

## 3. Regras de negócio

- **RN-4401** — Oferta é do tenant: `name`, `priceCents` (>0, inteiro), `type`
  (`addon`|`upgrade`|`produto`), `active`. Validação **pura** (`normalizeOffer`).
- **RN-4402** — A vitrine pública mostra **só ofertas ativas**; o tenant é resolvido
  pela fatura do checkout (`linkToken`), sem JWT (o pagador não tem sessão).
- **RN-4403 (cobrança separada)** — Aceitar gera uma **nova fatura one-time** do
  add-on (vence hoje), com cobrança no gateway do tenant. Mesmo padrão do acordo
  (0018): reserva → cobra → anexa; se o gateway falha, **desfaz a reserva**.
- **RN-4404** — Cada compra vira `OfferPurchase` ligada 1:1 à fatura do add-on
  (snapshot do preço). Base da métrica "receita extra realizada" = compras cuja
  fatura está `PAID`.
- **RN-4405** — Oferta **já comprada não é apagada** (preserva histórico/métrica):
  `DELETE` recusa com 409 → o dono **desativa** (`active=false`) em vez de apagar.
- **RN-4406** — Escopo por tenant em tudo. O extra é cobrado no **mesmo recebedor**
  do tenant (config de pagamento existente).

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260813000000_loja_no_pagamento`):
```prisma
model OfferProduct {
  id String @id; name String; priceCents Int; type String @default("addon")
  active Boolean @default(true); tenantId String  // + índice (tenantId, active)
}
model OfferPurchase {                 // liga oferta ↔ fatura do add-on (1:1)
  id String @id; priceCents Int       // snapshot
  offerId String; invoiceId String @unique; clientId String; tenantId String
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET    /api/offers            → [ OfferProduct ]
GET    /api/offers/summary    → { activeOffers, purchases, paidPurchases, revenueCents }
POST   /api/offers            { name, priceCents, type?, active? } → 201
PUT    /api/offers/:id        { name?, priceCents?, type?, active? }
DELETE /api/offers/:id        → 204 | 409 (se já comprada)

# Público (checkout do Elo, sem JWT — tenant pela fatura)
GET    /api/public/offers/:token          → [ { id, name, priceCents, type } ]
POST   /api/public/offers/:token/accept   { offerId } → { newInvoice: { id, value, dueDate, checkoutUrl, pixCopyPaste } }
```

## 6. Fluxo

- Dono cadastra ofertas em Configurações → Loja no Pagamento.
- Cliente abre `/pagar/:token`; o front busca `GET /public/offers/:token` e mostra a
  vitrine abaixo do "Pagar agora".
- Aceita → `POST /accept` → `OfferService.acceptOffer` (dentro de `runWithTenant`):
  reserva a fatura do add-on, cobra no gateway, anexa, grava `OfferPurchase` → devolve
  o destino de pagamento; o front mostra "Pagar o extra agora" (checkout ou PIX).
- Pagamento do add-on segue o **webhook** normal (0015) — cai nos relatórios.

## 7. Camadas afetadas

- [x] Schema/migration — `OfferProduct`, `OfferPurchase` (+ back-relations Invoice/Client/Account).
- [x] Domínio — `src/domain/offer.ts` (`normalizeOffer`, `buildAddonCharge`) + testes.
- [x] Repository — `offer.repository.ts` (CRUD, purchase, summary).
- [x] Service — `offer.service.ts` (CRUD dono, `listForToken`, `acceptOffer`, `summary`).
- [x] Controller/Router — `/api/offers` (JWT) + `/api/public/offers` (público).
- [x] Frontend — Configurações → Loja (CRUD + resumo) + vitrine no `PayPage`.
- [x] Testes — domínio (8) + serviço (7: aceite cria cobrança, rollback no erro, inativa, 404, delete c/ compra).
- [x] Contexto — `domain-model.md`, `motor-protecao-receita.md`.

## 8. Critérios de aceite

- [x] Vitrine mostra só ofertas ativas; tenant resolvido pela fatura.
- [x] Aceitar gera cobrança separada do add-on e registra `OfferPurchase`; rollback se o gateway falha.
- [x] Oferta já comprada não pode ser apagada (409) — desativar. Suíte verde + build limpo.

## 9. Notas de implementação

Escolha de v1 (confirmada com o dono): **cobrança separada** (não somar à fatura
atual) — o PIX/QR da fatura original já foi gerado pelo gateway; mexer nele é frágil.
Follow-up **F15.1** sob demanda: somar-na-fatura quando o gateway permitir, cupom, estoque.
