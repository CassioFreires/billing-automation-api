# Spec 0011 — Gateway InfinitePay (link de checkout) como provider padrão

- **Status**: Parcial — `createCharge` (link) implementado; `verifyAndParseWebhook` a validar com a doc oficial
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: seam de pagamento (`src/apis/payment/`), [0003 gateway], MercadoPago (`mercadopago.gateway.ts`)

## 1. Problema / Motivação

O Mercado Pago exige uma dança de credenciais/sandbox que travou os testes. O **InfinitePay** é mais simples de integrar: o checkout é um **link baseado no "handle"** do lojista (`checkout.infinitepay.io/{handle}`), já oferece **PIX e cartão**, e **não precisa de token para gerar a cobrança**. Vira o gateway **padrão** para comercializar; no futuro, o sistema exibirá mais de uma opção (seleção por tenant).

## 2. Objetivo

Adicionar o provider `infinitepay` ao seam existente e torná-lo o **default**, mantendo `mercadopago` e `mock` disponíveis por `PAYMENT_PROVIDER`.

## 3. Regras de negócio

- RN-P7: `createCharge` monta o link do checkout com `items` (valor em **centavos**), `order_nsu = referência interna` (localizador) e `redirect_url` opcional. `gatewayId = referência` (o InfinitePay a devolve como `external_order_nsu`).
- RN-P8: A confirmação **não confia no payload**: consulta o InfinitePay (payment_check) para decidir `PAID`. ⚠️ Endpoint/campos **a validar** com a doc da conta.
- RN-P4 (mantida): autenticidade/normalização do webhook é responsabilidade do provider.

## 4. Impacto no modelo de dados

Nenhum. Usa o mesmo `Invoice.gatewayId/checkoutUrl` já existente.

## 5. Configuração (env)

```
PAYMENT_PROVIDER=infinitepay        # default
INFINITEPAY_HANDLE=<seu-handle>     # obrigatório (nome no link do checkout)
INFINITEPAY_REDIRECT_URL=<url>      # opcional (retorno pós-pagamento)
# INFINITEPAY_CHECKOUT_URL / INFINITEPAY_API_URL têm default
```

## 6. Camadas afetadas

- [x] `infinitepay.gateway.ts` — `createCharge` (link) + `verifyAndParseWebhook` (a validar)
- [x] `payment/index.ts` — `case 'infinitepay'` + default trocado para `infinitepay`
- [x] `.env.example` — bloco InfinitePay
- [x] Testes — `createCharge` (link/centavos/handle) — determinístico
- [ ] `verifyAndParseWebhook` — finalizar com a doc oficial do InfinitePay
- [ ] Teste ponta a ponta (pagamento real → webhook → PAID)

## 7. Critérios de aceite

- [x] `PAYMENT_PROVIDER=infinitepay` gera `checkoutUrl` = `checkout.infinitepay.io/{handle}?items=…&order_nsu=…`.
- [x] Valor convertido para centavos; descrição no item.
- [x] Sem `INFINITEPAY_HANDLE` → erro claro.
- [ ] Pagamento real confirma a fatura como `PAID` via webhook (pendente doc).

## 8. Pendências

- **Webhook/confirmação**: validar com a documentação do InfinitePay o **formato do webhook** (campos, assinatura) e o **endpoint de payment_check**. O código atual segue o padrão "confirma no servidor" mas os nomes de campos/URL precisam ser conferidos.
- **Dev/testes**: manter `PAYMENT_PROVIDER=mock` fora de produção para não depender de credenciais.

## 9. Notas

Implementado em 2026-07-03. Só a geração do link foi validada (testes). A confirmação depende da doc oficial — próximo passo com o handle e a doc em mãos.
