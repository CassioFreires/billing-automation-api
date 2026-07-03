# Spec 0012 — Configuração de pagamento por tenant

- **Status**: Implementada (backend); frontend a seguir
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: [0011 InfinitePay], [0003 gateway], seam `src/apis/payment/`

## 1. Problema / Motivação

Num SaaS, **cada tenant recebe o pagamento na PRÓPRIA conta**. Logo, o meio de pagamento e as credenciais são **configuração de cada empresa**, não do sistema. Até aqui o gateway era resolvido por `.env` **global** (`PAYMENT_PROVIDER` + credenciais únicas), o que só serviria para um único recebedor.

## 2. Objetivo

Permitir que cada tenant escolha seu **provider** e informe suas **credenciais**, e fazer a criação da cobrança usar a config **daquele tenant**.

**v1 (agora):** provider + **handle do InfinitePay** (que é **público**, não-secreto → sem necessidade de criptografia).
**Fora de escopo (depois):** credenciais **secretas** (token do Mercado Pago) — exigem criptografia em repouso; e a **resolução do webhook por tenant** (hoje o webhook segue global/`.env`, pendente da doc do InfinitePay — spec 0011).

## 3. Regras de negócio

- RN-PS1: 1 configuração por tenant (`PaymentSetting.tenantId` único).
- RN-PS2: A criação da cobrança (`createPayment`, `createForSubscription`) resolve o gateway pela config do tenant (`resolvePaymentGatewayForTenant`), não pelo `.env`.
- RN-PS3: Sem config salva, usa um **default** (`PAYMENT_PROVIDER` do env, ou `infinitepay`).
- RN-PS4: `provider=infinitepay` exige `infinitepayHandle` (validação no DTO).
- RN-PS5: Isolamento por tenant (`requireTenantId`) em todas as leituras/escritas.

## 4. Modelo de dados

Novo `PaymentSetting { id, provider, infinitepayHandle?, redirectUrl?, createdAt, lastUpdate, tenantId @unique }`. Relação 1-1 com `Account`. Migração aditiva/idempotente (`20260703140000_payment_settings`).

## 5. Contrato de API

```
GET /api/settings/payment                         (JWT)
Response: 200 { provider, infinitepayHandle, redirectUrl }

PUT /api/settings/payment                         (JWT)
Body: { provider: "infinitepay"|"mercadopago"|"mock", infinitepayHandle?, redirectUrl? }
Response: 200 { ...settings }
          400 { error }  (ex.: infinitepay sem handle, URL inválida)
```

## 6. Fluxo

Criação de cobrança → `InvoiceService.gatewayForTenant()` → `PaymentSettingService.getForCurrentTenant()` → `resolvePaymentGatewayForTenant(config)` → provider instanciado com as credenciais do tenant (ex.: `InfinitePayGateway({ handle })`). Em testes, um gateway injetado tem prioridade.

## 7. Camadas afetadas

- [x] Schema/migration — `PaymentSetting`
- [x] DTO — `paymentSettings.dto.ts`
- [x] Repository — `payment-setting.repository.ts` (findByTenant, upsert)
- [x] Service — `payment-setting.service.ts` (getForCurrentTenant, get, update)
- [x] Provider — `InfinitePayGateway` aceita config por construtor (fallback env)
- [x] Seam — `resolvePaymentGatewayForTenant(config)`
- [x] InvoiceService — resolve gateway por tenant (mantém injeção p/ testes)
- [x] Controller/Router — `/api/settings/payment` (GET/PUT)
- [x] Testes — PaymentSettingService
- [ ] Frontend — tela de Configurações → Pagamento (próximo)
- [ ] Webhook por tenant + credenciais secretas (MP) — futuro

## 8. Critérios de aceite

- [x] `GET /settings/payment` retorna a config (ou default).
- [x] `PUT /settings/payment` salva provider + handle do tenant.
- [x] Criar fatura usa o handle **do tenant** no link do InfinitePay.
- [x] `infinitepay` sem handle → 400.
- [ ] Cada tenant vê/gera cobrança no seu próprio recebedor (validação E2E com contas reais).

## 9. Riscos / considerações

- **Segredos**: handle do InfinitePay é público (ok em texto). Token do MP é secreto → **não** guardar em texto; implementar criptografia antes de suportar MP por tenant.
- **Webhook**: continua global por ora. Para multi-tenant real, o webhook precisará descobrir o tenant pelo `gatewayId` (que é único global) e validar com as credenciais daquele tenant — fica para quando fecharmos o webhook do InfinitePay.

## 10. Notas

Implementado em 2026-07-03 (backend). Fundação pronta para "várias opções de pagamento por tenant". Frontend (tela de Configurações) é o próximo passo.
