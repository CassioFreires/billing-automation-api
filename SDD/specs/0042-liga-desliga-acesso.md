# Spec 0042 — Liga/Desliga o Acesso (estado de acesso) — F12

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0040/0041 (Contrato — pré-requisito legal), 0033 (recuperação),
  0034 (status efetivo), 0035 (Radar). Roadmap: `motor-protecao-receita.md` (**F12**).
  Consumidor futuro: **F13** (API/webhooks p/ catraca/IoT/streaming).

## 1. Problema / Motivação

O motivo mais forte para pagar em dia é **perder o acesso** ao serviço quando não paga
(academia, streaming, software). Falta um **estado de acesso** por cliente —
liberado/bloqueado — derivado do pagamento, que o mundo real (F13) possa consumir.
Bloquear é **sensível**: um bloqueio errado é grave. Por isso o v1 é conservador e
gated por contrato.

## 2. Objetivo

Definir, por cliente, um **estado de acesso** derivado do pagamento, com travas de
segurança fortes e **override manual** do dono. É o **estado**; a "tomada" que age
(catraca, streaming) é o F13.

## 3. Regras de negócio

- **RN-4201** — Estado **derivado** (calculado na leitura, sem job): `allowed` |
  `grace` | `blocked`. `granted = state !== 'blocked'`.
- **RN-4202 (trava)** — **Nunca bloqueia quem está em dia** (sem fatura vencida).
- **RN-4203 (trava)** — Só bloqueia se `AccessSetting.enabled`. Desligado → sempre `allowed`.
- **RN-4204 (trava legal)** — Se `requireSignedContract` (padrão **sim**) e o cliente
  **não** aceitou o contrato atual (F14) → **não bloqueia** (`allowed`).
- **RN-4205** — Com atraso: se `maxDiasAtraso <= graceDays` → `grace` (ainda liberado);
  senão → `blocked`.
- **RN-4206** — **Override manual** do dono vence tudo: `allow` força liberado, `block`
  força bloqueado, `none` volta ao derivado. Toda a regra acima só vale sem override.
- **RN-4207** — Escopo por tenant. Regra é **função pura testável** (`decideAccess`).

## 4. Impacto no modelo de dados

Migration **aditiva idempotente**:
```prisma
model AccessSetting {
  tenantId              String  @id
  enabled               Boolean @default(false)
  graceDays             Int     @default(3)
  requireSignedContract Boolean @default(true)
}
// Client ganha: accessOverride String?  // null | allow | block
```

## 5. Contrato de API

```
GET  /api/access/settings                 (JWT) → { enabled, graceDays, requireSignedContract }
PUT  /api/access/settings                 (JWT) { enabled?, graceDays?, requireSignedContract? }
GET  /api/access/clients                  (JWT) → [{ clientId, name, state, granted, reason, override, maxDaysOverdue }]
POST /api/access/clients/:id/override     (JWT) { override: 'allow'|'block'|'none' } → estado atualizado
```

## 6. Fluxo

Por cliente, junta: fatura vencida mais antiga (dias de atraso), config do tenant,
se aceitou contrato atual, override → `decideAccess(...)` (domínio puro) devolve
`state`/`granted`/`reason`. O F13 (futuro) vai ler `granted` para liberar/bloquear
o aparelho e emitir webhook na transição.

## 7. Camadas afetadas

- [ ] Schema/migration — `AccessSetting` + `Client.accessOverride`.
- [ ] Domínio — `src/domain/access.ts`: `decideAccess(input)` pura + testes (travas).
- [ ] Repository — `access.repository.ts`: settings (get/upsert), inputs por cliente (vencidos + contrato + override), setOverride.
- [ ] Service — `access.service.ts`: `getSettings`/`updateSettings`, `listClientsAccess`, `setOverride`.
- [ ] Controller/Router — `/api/access/*`.
- [ ] Frontend — Configurações (controle de acesso) + badge/override na lista de clientes.
- [ ] Testes — `decideAccess` (em dia; sem contrato; carência; bloqueado; overrides; desligado).
- [ ] Contexto — `domain-model.md` / marcar F12.

## 8. Critérios de aceite

- [ ] Cliente em dia nunca é bloqueado; controle desligado → todos liberados.
- [ ] `requireSignedContract` ligado + sem aceite → liberado (não bloqueia).
- [ ] Atraso ≤ carência → grace; > carência → blocked.
- [ ] Override allow/block vence a regra; none volta ao derivado. Suíte verde + build limpo.

## 9. Notas de implementação

_(F13 consome `granted`, emite webhook na transição e loga; multa/fidelidade dependem do contrato.)_
