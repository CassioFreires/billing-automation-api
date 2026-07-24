# Spec 0040 — Contrato no Celular (aceite digital) — F14

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0027 (Portal do pagador), 0016 (Elo — `hashIp`), 0022 (aceite de termos
  do tenant — padrão de prova). Roadmap: `motor-protecao-receita.md` (**F14**, base do F12).

## 1. Problema / Motivação

Para **cobrar com respaldo**, **reter** e, principalmente, **bloquear acesso** (F12) sem
risco jurídico, é preciso que o cliente tenha **concordado com um contrato**. Hoje não há
onde o dono publicar um contrato nem onde o cliente **aceitar** com **prova**. É o
alicerce legal do moat (não se bloqueia ninguém que não assinou nada).

## 2. Objetivo

- O dono escreve um **contrato** (título + texto + **versão**) na sua conta.
- O cliente **aceita no celular**, pelo **Portal** (sem login), com **prova de aceite**
  (nome digitado = assinatura, data/hora, `ipHash`, `userAgent`, versão).
- O dono vê **quem aceitou** e **qual versão**. Vira a base que o F12 exige para bloquear.

**Fora de escopo (v1):** PDF/assinatura ICP-Brasil; múltiplos contratos por cliente;
contra-assinatura do dono; anexos. É aceite eletrônico simples (válido no Marco Civil/
Código Civil como manifestação de vontade), com trilha de prova.

## 3. Regras de negócio

- **RN-4001** — `ContractSetting` é **1 por tenant**: `enabled`, `title`, `body`, `version`.
  Ao salvar, se `title`/`body` **mudou**, a **versão incrementa** (aceites anteriores
  continuam válidos para a versão que assinaram).
- **RN-4002** — Aceite (`ContractAcceptance`) é **append-only** e guarda **prova**: `version`,
  `acceptedName`, `acceptedDocument?`, `ipHash` (salgado, como o Elo — RN-ELO6), `userAgent`,
  `acceptedAt`. Nunca edita/apaga.
- **RN-4003** — Um cliente está **em dia com o contrato** se tem aceite da **versão atual**.
  Mudou a versão → precisa aceitar de novo.
- **RN-4004** — O aceite ocorre no **Portal público** (resolve o cliente pelo `portalToken`;
  entrada global, sem tenant-context — igual Elo/0016). Só aceita se houver contrato
  **habilitado**; nome é obrigatório.
- **RN-4005** — Idempotente: aceitar a **mesma versão** de novo não duplica (retorna o aceite existente).
- **RN-4006** — Escopo por tenant nas leituras do dono. Titular anonimizado (LGPD) não expõe portal/contrato.

## 4. Impacto no modelo de dados

Migration **aditiva idempotente**:
```prisma
model ContractSetting {
  id String @id @default(uuid())
  enabled Boolean @default(false)
  title   String  @default("Contrato de prestação de serviço")
  body    String  @default("")   // texto do contrato
  version Int     @default(1)
  tenantId String @unique
}
model ContractAcceptance {
  id String @id @default(uuid())
  version Int
  acceptedName String
  acceptedDocument String?
  ipHash String?
  userAgent String?
  acceptedAt DateTime @default(now())
  clientId String
  tenantId String
  @@index([tenantId, clientId])
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET /api/contract/settings                 → { enabled, title, body, version }
PUT /api/contract/settings   { enabled?, title?, body? }  → idem (version bump se mudou conteúdo)

# Portal (público, por portalToken)
GET  /public/portal/:token                 → agora inclui `contract: { title, body, version, accepted, acceptedAt } | null`
POST /public/portal/:token/contract/accept { name, document? } → { accepted:true, version, acceptedAt }

# Dono (JWT) — status: GET /api/clients já inclui `contract: { version, acceptedAt } | null` (última aceitação)
```

## 6. Fluxo

- **Dono** escreve o contrato em Configurações → habilita. Editar o texto sobe a versão.
- **Portal** (`GET /public/portal/:token`): devolve o contrato ativo do tenant + se o
  cliente já aceitou a versão atual. Se não aceitou, a UI mostra o texto + campo de nome +
  "Li e concordo".
- **Aceite** (`POST .../contract/accept`): grava `ContractAcceptance` (nome, versão,
  `ipHash`, `userAgent`). Idempotente por (cliente, versão).

## 7. Camadas afetadas

- [ ] Schema/migration — `ContractSetting`, `ContractAcceptance` (+ back-relations).
- [ ] Repository — `contract.repository.ts`: get/upsert setting (bump), record/latest acceptance, byTenant p/ portal.
- [ ] Service — `contract.service.ts`: dono (get/update) + portal (getForClient, accept).
- [ ] DTO — Zod (settings; accept).
- [ ] Controller/Router — `/api/contract/*` (JWT); accept no `publicPortalRouter`.
- [ ] Integração — Portal (`getByToken`) inclui `contract`; `GET /clients` inclui status.
- [ ] Frontend — Configurações (escrever/habilitar contrato) · Portal (ler + aceitar no celular) · badge "Contrato ✓ vX" no cliente.
- [ ] Testes — service (bump de versão; aceite idempotente; em-dia por versão).
- [ ] Contexto — `domain-model.md` / marcar F14.

## 8. Critérios de aceite

- [ ] Dono escreve/edita o contrato; editar o conteúdo sobe a versão.
- [ ] Portal mostra o contrato e permite aceitar (nome + concordo) → grava prova.
- [ ] Reaceitar a mesma versão não duplica; nova versão pede novo aceite.
- [ ] Dono vê quem aceitou e a versão. Suíte verde + build limpo.

## 9. Notas de implementação

_(preencher: PDF/e-sign avançada e F12 consumindo o "em-dia com contrato" — follow-ups.)_
