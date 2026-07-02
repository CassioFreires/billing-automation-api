# Integração WhatsApp — regra, modelo de custo e como plugar

> Documento de leitura contínua. Explica **como o envio de WhatsApp funciona no sistema**, o **modelo de custo** da Meta, e **a regra mais importante** (texto livre vs. template). Escrito a partir do código real (`src/apis/whatsapp.api.ts`).

---

## A ideia central: um "seam" (ponto de troca)

O sistema **não amarra** em um provedor de WhatsApp específico. Existe um contrato (`WhatsappProvider`) e a aplicação sempre chama `whatsappAPI.sendMessageWhatsapp(...)` sem saber quem está por trás. Qual provider roda é decidido pela variável **`WHATSAPP_PROVIDER`**:

| `WHATSAPP_PROVIDER` | Classe | O que faz | Custo |
|---|---|---|---|
| `log` (default) | `LogOnlyWhatsappProvider` | Só escreve a mensagem no log — **não envia** | zero |
| `cloud` | `CloudApiWhatsappProvider` | Envia de verdade via **Meta WhatsApp Cloud API** | pay-per-use (ver abaixo) |

Trocar de modo é **só mudar a env** — nenhum outro código muda. Isso permite as 3 fases:

```
Fase 1 (dev)      WHATSAPP_PROVIDER=log     → custo zero, não envia
Fase 2 (teste)    WHATSAPP_PROVIDER=cloud   → número de TESTE da Meta (grátis, até 5 destinos)
Fase 3 (produção) WHATSAPP_PROVIDER=cloud   → número real (pay-per-use, só quando envia)
```

---

## Modelo de custo da Meta (importante — desfaz um mito)

**A API do WhatsApp não é assinatura mensal.** O acesso é grátis; você paga **por conversa/mensagem enviada** (pay-per-use). Consequências práticas:

- **Sem envio = sem custo.** Ficar com `log` ou sem clientes não gera cobrança.
- A Meta oferece um **número de teste gratuito** que envia para **até 5 números pré-cadastrados** — perfeito para desenvolvimento e demonstração.
- Mensagens **utility** (cobrança/lembrete) são baratas; algumas dentro da janela de 24h são gratuitas.
- **Estratégia de negócio:** repasse o custo por mensagem ao seu cliente (embutido no plano). Assim o WhatsApp nunca sai do seu bolso.

> ⚠️ Valores exatos mudam por país e por época — não fixe centavos em lugar nenhum. O que vale é o **modelo**.

---

## 🔴 A regra mais importante: texto livre × template

Esta é a pegadinha que trava todo mundo em produção:

- **Mensagem de TEXTO livre** (o que o `CloudApiWhatsappProvider` envia hoje) só é entregue:
  - para o **número de teste** da Meta, **ou**
  - dentro da **janela de atendimento de 24h** — ou seja, se o cliente te mandou uma mensagem nas últimas 24h.
- **Cobrança iniciada por você** (business-initiated), fora dessa janela, **EXIGE um _template_ aprovado** pela Meta (`type: "template"`), com categoria (ex.: *utility*) e variáveis pré-definidas. O template passa por **aprovação** da Meta (leva de minutos a alguns dias).

**Tradução:** o provider atual cobre **teste, demo e a janela de 24h**. Para disparar cobrança em massa para quem não te respondeu, o próximo passo é **suporte a template** (enviar `type: 'template'` com o nome do template aprovado e os parâmetros). Isso está mapeado como evolução — ver "Próximos passos".

---

## Como o provider `cloud` funciona (o que o código faz)

Arquivo: `src/apis/whatsapp.api.ts` → `CloudApiWhatsappProvider`.

1. **Normaliza o telefone**: remove tudo que não é dígito (`normalizePhoneDigits`). A Cloud API espera só dígitos no padrão internacional, ex.: `5511999998888` — sem `+`, espaços ou traços.
2. **Monta a chamada** para `POST {baseUrl}/{apiVersion}/{phoneNumberId}/messages` com `Authorization: Bearer <WHATSAPP_TOKEN>`.
3. **Corpo**: `messaging_product: whatsapp`, `to`, `type: text`, `text.body` (a mensagem montada em `buildChargeMessage`).
4. **Resultado**: retorna `WhatsappSendResult` — `success`, `provider`, `targetPhone`, `providerMessageId` (id da Meta) ou `error`.
5. **Credenciais** são lidas e **validadas no boot** (`requireCloudWhatsappConfig`): se faltar `WHATSAPP_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID`, ele **falha alto** com mensagem clara — melhor que enviar errado em silêncio.

### Integração com o worker (durabilidade)
O worker (`src/works/invoice.worker.ts`) agora:
- **Envia primeiro** e só marca `notificationSent = true` **se deu certo**.
- Se o envio falhar (`success = false`), **lança erro** → cai no `catch` → `nack` → a fila **re-tenta** e, após `INVOICE_DELIVERY_LIMIT`, manda para a **DLQ**. Ou seja, uma cobrança que falhou **não é perdida** silenciosamente.

---

## Variáveis de ambiente

| Variável | Quando | Descrição |
|---|---|---|
| `WHATSAPP_PROVIDER` | sempre | `log` (default) ou `cloud` |
| `WHATSAPP_TOKEN` | se `cloud` | Token de acesso (temporário do painel de teste; permanente via System User em produção) |
| `WHATSAPP_PHONE_NUMBER_ID` | se `cloud` | **Phone number ID** (não é o telefone — é o id que aparece no painel) |
| `WHATSAPP_API_VERSION` | opcional | Default `v20.0` |
| `WHATSAPP_BASE_URL` | opcional | Default `https://graph.facebook.com` |

---

## Passo a passo: obter o número de teste grátis (Fase 2)

1. Crie/entre em uma conta **Meta for Developers** (developers.facebook.com) e um **App** do tipo Business.
2. Adicione o produto **WhatsApp** ao app.
3. Na tela de introdução do WhatsApp, a Meta te dá um **número de teste** e um **token temporário** (~24h) — copie o **Token** e o **Phone number ID**.
4. Em "To", **cadastre seu próprio número** de WhatsApp (o de teste só envia para até 5 números verificados).
5. No `.env`:
   ```dotenv
   WHATSAPP_PROVIDER=cloud
   WHATSAPP_TOKEN=<token temporário>
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   ```
6. Suba o worker e dispare uma notificação — a mensagem chega no seu WhatsApp. **Custo zero.**

> Token temporário expira em ~24h. Para testes contínuos/produção, gere um **token permanente** via *System User* (Business Settings). Em produção, o número precisa ser **verificado** e sair do modo de teste.

---

## Próximos passos (evolução)

1. **Suporte a template** (`type: 'template'`): necessário para cobrança fora da janela de 24h. Adicionar um modo no provider que envia template + parâmetros, controlado por env (ex.: `WHATSAPP_TEMPLATE_NAME`).
2. **Webhook de status de entrega**: a Meta envia `sent/delivered/read/failed`. Consumir para dar rastreabilidade real (hoje o sistema só sabe que "chamou a API com sucesso").
3. **Normalização E.164 completa** (PR-12): hoje só removemos não-dígitos; falta garantir DDI/DDD corretos.

## Quem é o remetente? (modelo multi-cliente)

Uma decisão estrutural à parte: a cobrança sai do **nosso** número/CNPJ (Modelo A) ou do número/CNPJ **de cada cliente** (Modelo B, padrão de SaaS)? Isso define se as credenciais são globais (`.env`, hoje) ou **por tenant** (no banco). Está documentado em **`../specs/0005-whatsapp-sender-model.md`** — inclusive a decisão atual (adiar: modo `log` não exige CNPJ; no Modelo B o CNPJ é de cada cliente).

Relacionado: `fluxo-completo.md` (onde o envio se encaixa no fluxo) e `tech-debt.md` (dívida **D-02**).
