# Spec 0019 — Multi-gateway de pagamento + credenciais criptografadas

- **Status**: Implementada
- **Autor**: time Adimplo
- **Data**: 2026-07-21
- **Dívida relacionada**: D-17 (cifra de segredos — reusada); introduz **D-23** (contas reais dos gateways / corpo cru / certificado PIX do Efí). Relaciona-se com D-18 (webhook InfinitePay).

## 1. Problema / Motivação

Para comercializar, o dono precisa usar **o gateway que ele já tem**. Antes havia só
3 opções (`mock`, `mercadopago`, `infinitepay`) e nenhum lugar seguro para guardar
credenciais secretas por tenant. A pesquisa de mercado (2026) aponta **Asaas,
PagBank/PagSeguro, Efí, Stripe e Pagar.me** como os mais usados por PMEs no Brasil.

## 2. Objetivo

Tornar o provider de pagamento **selecionável pelo dono** entre 8 opções, com
**credenciais por tenant criptografadas em repouso** e **webhook roteado por
provider**. Cada gateway usa o mesmo seam `PaymentGatewayProvider`, então
mock → real é só configuração.

**Fora de escopo:** ligar contas REAIS de cada gateway ponta-a-ponta (sandbox/mock
valida o wiring; conta real = D-23), certificado mTLS do PIX do Efí, e captura de
corpo cru para Stripe/Pagar.me em produção (D-23).

## 3. Regras de negócio

- **RN-G1**: o provider é escolhido por tenant (`PaymentSetting.provider`), entre
  `infinitepay | mercadopago | mock | asaas | pagbank | efi | stripe | pagarme`.
- **RN-G2**: segredos ficam em `PaymentSetting.credentialsEnc` — JSON específico do
  provider, **cifrado** (AES-256-GCM, prefixo `enc:v1:`, reuso de `infrastructure/crypto`).
- **RN-G3**: a API **nunca** devolve segredos; só `credentialStatus` (quais estão
  setados) — espelha o `hasToken` do WhatsApp (RN de D-17).
- **RN-G4**: campo de segredo em branco no update = **mantém o salvo**; troca de
  provider zera a base (não carrega segredo de outro gateway).
- **RN-G5** (webhook multi-gateway): o provider vem da URL (`/webhook/:provider`); o
  tenant é localizado pela **nossa** `reference` no payload (`extractReference`), e a
  assinatura é verificada com a credencial **daquele tenant**. Mudança de estado só
  ocorre se a assinatura passar (herda a idempotência/transição das RN-P2..P5).

## 4. Impacto no modelo de dados

- `PaymentSetting`: **+1 coluna** `credentialsEnc String?`.
- Migration additiva/idempotente `20260722000000_payment_credentials`
  (`ADD COLUMN IF NOT EXISTS`).
- Sem novas entidades; sem mudança de estados de fatura.

## 5. Contrato de API

```
GET /api/settings/payment
Response 200 {
  provider, infinitepayHandle, redirectUrl,
  credentialStatus: { apiKey, token, clientId, ..., accessToken: boolean }  // sem segredos
}

PUT /api/settings/payment
Request {
  provider: <8 opções>,
  infinitepayHandle?, redirectUrl?,
  credentials?: { apiKey?, token?, clientId?, clientSecret?, certificateBase64?,
                  secretKey?, webhookSecret?, webhookToken?, accessToken? }  // write-only
}
Response 200 { ...igual ao GET (mascarado)... } | 400 { error }

POST /api/invoices/webhook/:provider   (público, sem JWT)
  → 200 { success, ignored, duplicate } | 401 assinatura inválida | 404 fatura
POST /api/invoices/webhook             (legado, provider do .env — mantido)
```

Validação Zod em `dtos/paymentSettings.dto.ts` (enum de provider + credenciais opcionais).

## 6. Fluxo / Processamento

- **Cobrança**: `invoice.service.gatewayForTenant()` → `paymentSettings.getForCurrentTenant()`
  (decifra `credentialsEnc`) → `resolvePaymentGatewayForTenant(config)` →
  `gateway.createCharge(...)`. `gatewayId = reference` (localizador uniforme).
- **Webhook**: `invoice.service.applyWebhookForProvider(provider, req)` →
  `resolvePaymentGatewayByName(provider).extractReference(req)` → `findByGatewayId` →
  `runWithTenant(tenantId)` carrega credenciais → `resolvePaymentGatewayForTenant` →
  `verifyAndParseWebhook` → `applyWebhook` (idempotente). Sem referência (MP/mock),
  cai no provider por env (legado).

## 7. Camadas afetadas

- [x] DTO — `dtos/paymentSettings.dto.ts`
- [x] Repository — `repositories/payment-setting.repository.ts` (cifra/decifra)
- [x] Service — `services/payment-setting.service.ts`, `services/invoice.service.ts`
- [x] Controller — `controllers/invoice.controller.ts`
- [x] Router — `routers/invoice.router.ts` (`/webhook/:provider`)
- [x] Schema Prisma / migration — `PaymentSetting.credentialsEnc`
- [x] Integração externa — `apis/payment/{asaas,pagbank,efi,stripe,pagarme}.gateway.ts`,
      `apis/payment/webhook-verify.ts`, `apis/payment/index.ts`, `types.ts`
- [x] Front — `settings.service.ts`, `pages/Settings/SettingsPage.tsx`

## 8. Critérios de aceite

- [x] O dono escolhe 1 de 8 providers e salva credenciais na tela de Configurações.
- [x] A API nunca retorna segredo (só `credentialStatus`); o valor persiste cifrado.
- [x] Cada gateway monta o request certo e mapeia status (testes com `fetch` mockado).
- [x] Webhook rejeita assinatura inválida (401) e é idempotente.
- [x] InfinitePay/MP/mock e o `/webhook` legado continuam funcionando.
- [x] `npm run build` limpo; suíte verde (211 testes).

## 9. Cenários de teste sandbox (por provider)

Para cada provider, com credenciais de sandbox salvas em Configurações:
1. Criar fatura → confirmar `checkoutUrl` gerado pelo gateway.
2. Simular webhook em `POST /api/invoices/webhook/<provider>` com assinatura válida →
   fatura vai a `PAID`; assinatura inválida → 401; reenvio → `duplicate:true`.
- **Asaas**: header `asaas-access-token`; evento `PAYMENT_RECEIVED/CONFIRMED`.
- **PagBank**: header `x-authenticity-token = sha256(corpo+token)`; `charges[].status=PAID`.
- **Efí**: OAuth → charge → link; webhook por token compartilhado; PIX exige cert (D-23).
- **Stripe**: `Stripe-Signature` HMAC; `checkout.session.completed` (corpo cru em prod, D-23).
- **Pagar.me**: `X-Hub-Signature` HMAC; `order.paid` (corpo cru em prod, D-23).

## 10. Riscos / considerações

- **Corpo cru** (Stripe/Pagar.me): a verificação usa `JSON.stringify(body)` até o app
  capturar o corpo cru nessas rotas — **D-23**. Não afeta os que autenticam por header
  (Asaas/PagBank/Efí) nem MP.
- **MP por tenant**: o webhook do MP não traz `external_reference` (só o id do pagamento);
  continua resolvendo via env (legado) até embutir o tenant na `notification_url` — D-23.
- **Segurança**: exige `ENCRYPTION_KEY`; segredos nunca trafegam de volta. Verificar no
  banco que `credentialsEnc` está em `enc:v1:...`.

## 11. Notas de implementação

- **Bug de idempotência corrigido (RN-P3, pré-existente):** o `applyWebhookAtomic`
  capturava o `P2002` do INSERT do `WebhookEvent` e seguia consultando na MESMA
  transação — mas o Postgres já a havia abortado (erro `25P02`), quebrando o reenvio.
  Reestruturado para um **fast-path fora da transação** (reenvio comum) + `catch`
  externo do `P2002` (corrida) com a transação em rollback limpo. Surgiu no E2E do
  webhook multi-gateway e afetava também o `/webhook` legado. Validado local:
  A `duplicate:false` → B `duplicate:true`, fatura `PAID`.
- Validação local (Docker): migração aplicada, `credentialsEnc` cifrado (`enc:v1:`),
  `GET/PUT /settings/payment` mascarados (segredo nunca retorna), webhook por provider
  com 401 em assinatura inválida. 211 testes verdes.
