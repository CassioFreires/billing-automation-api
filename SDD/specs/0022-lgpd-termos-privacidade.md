# Spec 0022 — LGPD: Termos, Política de Privacidade e direitos do titular (UI)

- **Status**: Implementada (código) · parte jurídica dos textos = revisão externa pendente
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0004 (LGPD — código de export/anonimização), production-readiness PR-06

> ⚠️ Este documento e os textos gerados (Política/Termos) são **modelos iniciais**, não
> constituem aconselhamento jurídico. Antes de operar com dados reais, revisar com jurídico
> (base legal, DPO, DPA, ROPA, retenção — spec 0004 §11).

## 1. Problema / Motivação

O Adimplo já tem o **código** dos direitos do titular (spec 0004: exportar/anonimizar cliente,
hash de IP), mas falta a **camada visível e de conformidade** que um cliente vai cobrar antes
de contratar: **Política de Privacidade** e **Termos de Uso** publicados, **aceite no cadastro**,
aviso de privacidade ao pagador, e uma **tela** onde o dono exerce os direitos (dele e dos
titulares dele) sem depender de chamada de API crua.

## 2. Objetivo

Tornar a conformidade LGPD **visível e operável pela UI**, reusando o código da 0004.

- **Em escopo:** páginas públicas `/privacidade` e `/termos`; **aceite obrigatório** dos termos
  no registro (persistido com versão); **banner de privacidade** (cookies/dados) dispensável;
  **nota de privacidade** na página do pagador; seção **"Privacidade e dados (LGPD)"** nas
  Configurações com: exportar/anonimizar um cliente (reusa 0004), **exportar os dados da própria
  conta** e **encerrar a conta** (direito de eliminação do próprio titular-cliente do SaaS).
- **Fora de escopo:** DPO/DPA/ROPA formais, base legal por finalidade, retenção automatizada,
  portal self-service do pagador (é a spec 0027). O texto jurídico final é responsabilidade do
  jurídico — aqui entra um **modelo versionado**.

## 3. Regras de negócio

- **RN-2201** — O registro **exige aceite** dos Termos e da Política (`acceptedTerms === true`),
  senão a criação da conta é rejeitada (400).
- **RN-2202** — O aceite é **persistido** no `Account` com data (`acceptedTermsAt`) e **versão**
  do texto (`acceptedTermsVersion = LEGAL_VERSION`), para prova de consentimento.
- **RN-2203** — Política e Termos são **públicos** (sem login), com a versão/data visível.
- **RN-2204** — O dono pode **exportar os dados da própria conta** (portabilidade) — inclui
  conta, usuários (com e-mail, que é PII dele), clientes, faturas, pagamentos e assinaturas.
- **RN-2205** — O dono pode **encerrar a conta** (eliminação). Ação destrutiva, exige **digitar
  o nome exato da conta** para confirmar; remove o tenant e tudo em cascata. Escopo: só o
  próprio tenant do solicitante (nunca outro).
- **RN-2206** — Os direitos sobre um **titular (cliente do dono)** seguem a 0004: exportar
  (JSON) e **anonimizar** (mantém faturas, remove PII) — agora acessíveis pela UI.
- **RN-2207** — A página do pagador (`/pagar`) exibe uma **nota de privacidade** com link para
  a Política (transparência do tratamento no momento da coleta).

## 4. Impacto no modelo de dados

- `Account.acceptedTermsAt DateTime?` e `Account.acceptedTermsVersion String?` (prova de aceite).
- Migration aditiva idempotente `20260727000000_terms_acceptance` (ADD COLUMN IF NOT EXISTS).
- Reuso: `Client.anonymizedAt` (0004). Sem novas tabelas.

## 5. Contrato de API

```
POST /api/auth/register        (público, já existe — DTO ganha acceptedTerms)
Request:  { accountName, name, email, password, acceptedTerms: true }
Response: 201 { token } | 400 { error }  (rejeita se acceptedTerms != true)

GET  /api/lgpd/account/export  (JWT)  → 200 { exportedAt, account, users[], clients[], invoices[], payments[], subscriptions[] }
POST /api/lgpd/account/delete  (JWT)  → body { confirmName }
       200 { deleted: true } | 400 { error: 'NAME_MISMATCH' }

# já existentes (0004), agora consumidos pela UI:
GET  /api/lgpd/clients/:clientId/export     (JWT)
POST /api/lgpd/clients/:clientId/anonymize  (JWT)
```

## 6. Fluxo / Processamento

- **Registro:** front adiciona checkbox obrigatório com links p/ `/termos` e `/privacidade`;
  envia `acceptedTerms`. Back valida (RN-2201) e grava aceite+versão no Account (RN-2202).
- **Export da conta:** `LgpdService.exportAccountData()` lê tudo do tenant via `AccountRepository`
  (escopo por tenant) e devolve um JSON; o front baixa como arquivo.
- **Encerrar conta:** `LgpdService.deleteAccount(confirmName)` compara com o nome do Account;
  se bater, `account.delete` (cascade). O front então faz logout e volta à landing.
- **Banner/nota:** componentes de UI; o banner guarda o "ok" em `localStorage`.

## 7. Camadas afetadas

- [x] Schema/migration — `Account.acceptedTermsAt/Version` + `20260727000000_terms_acceptance`
- [x] Domain — `src/domain/legal.ts` (`LEGAL_VERSION`)
- [x] DTO — `src/dtos/register.dto.ts` (+acceptedTerms)
- [x] Repository — `src/repositories/account.repository.ts` (export/delete/aceite)
- [x] Service — `src/services/lgpd.service.ts` (+account export/delete), `auth.service` (aceite)
- [x] Controller/Router — `lgpd.controller`/`lgpd.router` (+/account/*)
- [x] Frontend — páginas `/privacidade` e `/termos`, aceite no Register, banner, nota no /pagar,
      seção LGPD nas Configurações (+ `services/lgpd.service.ts`, hooks)

## 8. Critérios de aceite

- [ ] Registrar sem marcar o aceite → 400; com aceite → cria conta e grava `acceptedTermsAt`+versão.
- [ ] `/privacidade` e `/termos` abrem sem login e mostram a versão/data.
- [ ] Configurações → exportar a conta baixa um JSON com os dados do tenant.
- [ ] Encerrar conta só funciona digitando o nome exato; some o tenant e faz logout.
- [ ] Exportar/anonimizar um cliente pela UI funciona (reusa 0004); anonimizar mantém faturas.
- [ ] `/pagar` mostra a nota de privacidade com link para a Política.
- [ ] Banner de privacidade aparece uma vez e some ao aceitar (persistente).

## 9. Riscos / considerações

- **Texto jurídico:** os modelos precisam de revisão profissional (marcado na página). Versionar
  o texto (`LEGAL_VERSION`) permite pedir novo aceite quando mudar.
- **Encerrar conta é destrutivo:** por isso a confirmação por nome e o escopo ao próprio tenant.
- **PII no export da conta:** inclui e-mail do dono (dado dele) — é portabilidade legítima; a
  resposta exige JWT do próprio tenant.

## 10. Notas de implementação

- **Aceite:** `registerSchema` ganhou `acceptedTerms` (refine `=== true`); o registro grava
  `acceptedTermsAt`/`acceptedTermsVersion` no `Account` (via `createAccountWithOwner`).
  `LEGAL_VERSION` em `src/domain/legal.ts` (espelhado no front em `LegalLayout`).
- **Conta:** `AccountRepository` ganhou `findCurrent/exportCurrent/deleteCurrent` (tenant-scoped);
  `LgpdService.exportAccountData()` e `deleteAccount(confirmName)` (erro `NAME_MISMATCH`).
- **Front:** páginas públicas `/privacidade` e `/termos` (modelo revisável, versionado);
  checkbox de aceite obrigatório no Register; `PrivacyBanner` global (localStorage
  `adimplo.privacy_ack`); nota de privacidade no `shell` do PayPage; seção "Privacidade e dados
  (LGPD)" nas Configurações (`PrivacySettings`) reusando export/anonimizar de cliente (0004) +
  export/encerrar conta; links no rodapé da landing.
- **Testes:** LgpdService (export/delete conta, NAME_MISMATCH), registerSchema (aceite
  obrigatório). Suíte API: 268 verdes. Web: `tsc -b` + build OK.
- **Follow-ups (jurídico, spec 0004 §11):** base legal por finalidade, DPO/canal, DPA B2B,
  ROPA, política de retenção automatizada. Texto atual é modelo, marcado como tal na UI.
- **Fora (por ora):** portal self-service do pagador para exercer direitos (é a spec 0027).
