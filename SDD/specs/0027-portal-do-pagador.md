# Spec 0027 — Portal do pagador

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0016 (Elo/link), 0018 (pagamento/acordo), 0004/0022 (LGPD)

## 1. Problema / Motivação

Hoje o pagador só recebe o link de **uma** cobrança (`/r/:token` → `/pagar`). Quem tem várias
faturas não tem uma visão única ("o que eu devo?"). Um **portal** por pagador — todas as
cobranças em aberto + histórico — reduz atrito, dá transparência e aumenta a recuperação.

## 2. Objetivo

Uma página pública por cliente com **todas as suas cobranças**, sem login.

- **Em escopo:** `portalToken` por cliente; endpoint público `GET /api/public/portal/:token`;
  página `/portal/:token` (abertas com botão Pagar + histórico); botão do dono para copiar o
  link do portal de cada cliente.
- **Fora de escopo:** login/autenticação do pagador; edição de dados pelo pagador; comprovantes
  em PDF (o campo `receiptUrl` existe mas upload é futuro).

## 3. Regras de negócio

- **RN-2701** — Cada cliente tem um `portalToken` **único**, gerado sob demanda (lazy) pelo dono.
- **RN-2702** — O portal é **público** e resolvido pelo token (entrada global, como o Elo); nunca
  expõe segredos de gateway — só valor, status, vencimento, data de pagamento e o link do Elo.
- **RN-2703** — Cliente **anonimizado** (LGPD) não expõe portal (retorna 404).
- **RN-2704** — Cobranças são separadas em **em aberto** (PENDING/OVERDUE, com botão Pagar via
  `/r/:token`) e **histórico** (demais). Mostra o total em aberto.

## 4. Impacto no modelo de dados

- `Client.portalToken String? @unique`. Migration aditiva idempotente `20260729000000_portal_pagador`.

## 5. Contrato de API

```
GET /api/public/portal/:token   (público) → 200 {
  clientName, open: [{id,value,status,dueDate,paidAt,payUrl}], history: [...],
  totals: { openCount, openValue }
} | 404
GET /api/clients/:id/portal-link  (JWT) → { url }   (gera/recupera o token)
```

## 6. Fluxo / Processamento

- **Dono:** na lista de Clientes, clica no ícone de link → `getPortalLink` gera/recupera o token
  e devolve `WEB_APP_URL/portal/:token`; o front copia para a área de transferência.
- **Pagador:** abre `/portal/:token` → `PortalService.getByToken` resolve o cliente (global),
  lista as faturas (`findForPortal`, global), monta `payUrl` (`APP_URL/r/:token`) e devolve a visão.

## 7. Camadas afetadas

- [x] Schema/migration — `Client.portalToken`
- [x] Repository — `ClientRepository.findByPortalToken`/`ensurePortalToken`; `InvoiceRepository.findForPortal`
- [x] Service — `PortalService` (getByToken, getPortalLink)
- [x] Controller/Router — `portal.controller` + `publicPortalRouter` (`/api/public/portal`) + `GET /clients/:id/portal-link`
- [x] Frontend — página pública `/portal/:token`, `portal.service`, botão de copiar link em Clientes

## 8. Critérios de aceite

- [ ] Copiar o link de um cliente e abrir `/portal/:token` mostra abertas + histórico.
- [ ] Cada aberta com link do Elo tem botão Pagar; total em aberto confere.
- [ ] Token inválido → página "portal não encontrado".
- [ ] Cliente anonimizado → 404.

## 9. Riscos / considerações

- **Privacidade:** o token é um segredo de capacidade (quem tem o link vê as cobranças daquele
  cliente). Não expõe documento nem telefone na resposta; só o nome. Regenerar (revogar) o token
  é follow-up.
- **Sem PII sensível** na resposta pública (sem gatewayId/pix cru — o pagamento passa pelo Elo).

## 10. Notas de implementação

- Reusa o padrão de entrada global do Elo (`findByLinkToken`). `PortalService` testado (5 casos):
  split aberto/histórico, payUrl, token inexistente, anonimizado, geração do link. Suíte API: 285.
- Follow-up: revogar/rotacionar `portalToken`; comprovantes (receiptUrl) no histórico; expor no
  onboarding/UX ("compartilhe o portal com seu cliente").
