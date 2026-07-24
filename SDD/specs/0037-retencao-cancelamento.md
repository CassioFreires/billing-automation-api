# Spec 0037 — Segura Quem Quer Sair (retenção no cancelamento)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-23
- **Relacionada**: 0009 (assinaturas), 0035 (Radar/F2), 0018 (alívio/negociação).
  Roadmap: `motor-protecao-receita.md` (**F11**).

## 1. Problema / Motivação

O motor já cuida do churn **involuntário** (F1: o cliente quer continuar mas o
pagamento falhou). Falta o churn **voluntário**: o cliente **quer** cancelar. Hoje
cancelar é um `PUT status=CANCELED` seco — a empresa **perde o cliente sem lutar**.
Boa parte de quem cancela sairia por **aperto** (preço) ou **preguiça/desuso** e
ficaria com uma alternativa: **pausar**, **desconto temporário**, **downgrade** ou
**voltar depois**. Falta um fluxo que ofereça a saída certa **antes** de efetivar.

## 2. Objetivo

Ao pedir cancelamento de uma assinatura, abrir um **CancellationRequest**, **recomendar
uma oferta de retenção** com base no **motivo** e na **saúde do cliente (F2)**, e deixar
resolver como **salvo** (aplicando a oferta) ou **cancelado**. Registrar o desfecho para
métrica de retenção (salvos vs perdidos) e aprendizado.

**Escopo v1 (dono):** o fluxo é operado pelo **dono** no app (na tela de Assinaturas).
Ação concreta imediata = **pausar** (retém sem perder margem — RN-F11-01). Desconto/
downgrade/winback são **registrados como oferta escolhida** (execução concreta de
desconto/downgrade é follow-up). **Fora de escopo v1:** autoatendimento no Portal do
pagador; multa/fidelidade (depende de contrato, F14); aplicação automática de desconto.

## 3. Regras de negócio

- **RN-3701** — Cancelar **abre** um `CancellationRequest` (`open`) em vez de cancelar
  direto. `decideSaveOffer(reason, healthBand)` (domínio puro) recomenda a oferta.
- **RN-3702** — Oferta por **motivo**: `preco` → **desconto**; `nao_uso` → **pausar**;
  `mudanca` → **voltar depois** (winback); `insatisfacao` → **downgrade**; `outro`/
  desconhecido → **pausar** (default seguro). **Pausar é preferido** quando o cliente
  está `at_risk` (não “queima” margem com desconto em quem provavelmente sairia).
- **RN-3703** — Resolver: **`saved`** (aplica a oferta) ou **`cancelled`** (efetiva o
  cancelamento). `saved`+`pause` → assinatura `PAUSED`; `cancelled` → `CANCELED`.
  Idempotente: request já resolvido não reaplica.
- **RN-3704** — Registrar **quem foi salvo** e **por qual oferta** (`saveOffer`) +
  `resolvedAt` (métrica de retenção).
- **RN-3705** — Tudo escopado por `tenantId`. Só assinatura do tenant pode abrir/resolver.

## 4. Impacto no modelo de dados

Uma entidade nova (migration **aditiva idempotente**):

```prisma
model CancellationRequest {
  id             String    @id @default(uuid())
  reason         String?   // preco | nao_uso | mudanca | insatisfacao | outro
  status         String    @default("open") // open | saved | cancelled
  recommended    String?   // oferta recomendada pelo domínio
  saveOffer      String?   // oferta efetivamente aplicada (quando saved)
  createdAt      DateTime  @default(now())
  resolvedAt     DateTime?
  clientId       String
  subscriptionId String
  tenantId       String
  @@index([tenantId, status])
}
```
Sem alteração destrutiva. Assinatura reusa `status` (ACTIVE/PAUSED/CANCELED, 0009).

## 5. Contrato de API

```
# Tenant (JWT)
POST /api/retention/requests            { subscriptionId, reason } → { id, reason, recommended, message, subscription }
POST /api/retention/requests/:id/resolve{ outcome: 'saved'|'cancelled', offer? }  → { id, status, saveOffer }
GET  /api/retention/requests            → [{ id, clientName, reason, status, recommended, saveOffer, createdAt, resolvedAt }]
```
`jwtAuth` em tudo; validação Zod.

## 6. Fluxo / Processamento

`POST /retention/requests` → `RetentionService.openRequest(subscriptionId, reason)`:
carrega assinatura + `client.health.band` → `decideSaveOffer` → cria request `open`
com `recommended` → devolve a oferta/mensagem para a UI mostrar.

`POST /retention/requests/:id/resolve` → aplica: `saved`+`pause` pausa a assinatura;
`cancelled` cancela; grava `status`/`saveOffer`/`resolvedAt` (idempotente).

## 7. Camadas afetadas

- [ ] Schema/migration — `CancellationRequest`.
- [ ] Domínio — `src/domain/save-offer.ts`: `decideSaveOffer(reason, band)` pura + testada.
- [ ] DTO — `src/dtos/retention.dto.ts` (Zod: reason, outcome, offer).
- [ ] Repository — `retention.repository.ts` (criar/buscar/listar/resolver; assinatura c/ health).
- [ ] Service — `retention.service.ts` (`openRequest`, `resolveRequest`, `listRequests`).
- [ ] Controller/Router — `/api/retention/*`.
- [ ] Frontend — botão "Cancelar" da assinatura abre o fluxo (motivo → oferta → pausar/cancelar) + contagem de salvos.
- [ ] Testes — `decideSaveOffer` (cada motivo → oferta; at_risk vira pause) + service (abrir/resolver idempotente).
- [ ] Contexto — `domain-model.md`, `motor-protecao-receita.md` (marcar F11).

## 8. Critérios de aceite

- [ ] Cada motivo mapeia para a oferta certa; `at_risk` puxa para **pausar**.
- [ ] Resolver `saved`+`pause` deixa a assinatura `PAUSED`; `cancelled` deixa `CANCELED`.
- [ ] Request resolvido não reaplica (idempotente).
- [ ] Lista mostra salvos vs cancelados. Suíte verde + build limpo.

## 9. Notas de implementação

_(preencher: execução concreta de desconto/downgrade — follow-up; autoatendimento no
Portal; integração com contrato/F14 para multa/fidelidade.)_
