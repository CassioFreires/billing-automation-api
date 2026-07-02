# Spec 0005 — Modelo de remetente do WhatsApp (quem dispara a cobrança)

- **Status**: Rascunho (decisão adiada — ver §2)
- **Autor**: Cassio
- **Data**: 2026-07-02
- **Dívida relacionada**: D-02 (integração WhatsApp) · relacionada à multi-tenancy (spec 0001)

## 1. Problema / Motivação

O sistema envia cobrança por WhatsApp. Surge a pergunta estrutural de um SaaS multi-cliente: **de qual número/conta a mensagem sai?** Da empresa que opera a plataforma (nós) ou de cada cliente (tenant)? A resposta define credenciais, onboarding, verificação de CNPJ, marca exibida ao devedor e a complexidade do código.

Hoje as credenciais do WhatsApp (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) são **globais**, lidas do `.env` (ver `context/whatsapp-integration.md`) — o que só atende o **Modelo A** abaixo.

## 2. Objetivo

Registrar os dois modelos possíveis, seus trade-offs e a **decisão atual**, para orientar a evolução sem retrabalho.

**Decisão atual (2026-07-02):** operar em **modo `log`** enquanto não há clientes (custo zero, sem CNPJ). Adotar o **Modelo A** apenas se/quando o 1º cliente exigir envio real; evoluir para o **Modelo B** ao escalar. **Não** implementar o Modelo B agora — apenas deixar o seam preparado.

**Fora de escopo:** implementação do embedded signup e criptografia de credenciais por tenant (viram spec própria quando o Modelo B for aprovado).

## 3. Os dois modelos

### Modelo A — Plataforma é o remetente (número/CNPJ nossos)
- Uma única WhatsApp Business Account (WABA), um número, **um CNPJ (nosso)**.
- Toda cobrança sai da **nossa marca**.
- Credenciais **globais** (`.env`) — é o que o código já suporta.
- Simples; ruim para escala e para a marca do cliente. Mistura tráfego de vários clientes num número só.

### Modelo B — Cada cliente é o remetente (número/CNPJ de cada tenant)
- Cada `Account` (tenant) tem **sua própria** WABA, número e **CNPJ próprio**.
- A cobrança sai da **marca do cliente**. É o padrão de mercado (operar como **BSP / Tech Provider** da Meta).
- Credenciais **por tenant** (no banco), não no `.env`.
- **A verificação de negócio (CNPJ) é de cada cliente**, não nossa.
- Onboarding via **Embedded Signup** da Meta (o cliente autoriza nossa plataforma a enviar pelo número dele).

| Critério | Modelo A | Modelo B |
|---|---|---|
| CNPJ / verificação | Só o nosso | De cada cliente |
| Marca na mensagem | Nossa | Do cliente |
| Credenciais | Global (`.env`) | Por tenant (banco) |
| Complexidade | Baixa | Alta (embedded signup) |
| Escala como SaaS | Ruim | Correto |

## 4. Impacto no modelo de dados (quando o Modelo B for adotado)

Adicionar ao `Account` (ou tabela `WhatsappCredential` 1:1 com Account):

- `whatsappPhoneNumberId` (String?)
- `whatsappToken` (String? — **criptografado em repouso**)
- `whatsappWabaId` (String?)
- `whatsappStatus` (String — `DISCONNECTED` | `PENDING` | `CONNECTED`)

Migration aditiva e idempotente (ver `skills/db-migration.md`).

## 5. Contrato de API (quando o Modelo B for adotado)

Onboarding do WhatsApp por tenant (esboço):

```
POST /api/whatsapp/connect        (inicia embedded signup; devolve URL/estado)
POST /api/whatsapp/callback       (recebe o retorno da Meta; salva credenciais no Account)
GET  /api/whatsapp/status         (status da conexão do tenant)
```

## 6. Fluxo / Processamento

O worker já recebe o `tenantId` carimbado no payload da fila (RN-T5). A mudança do Modelo B é **localizada**: em vez de resolver as credenciais do `.env` (global), o provider resolve **as credenciais do tenant** (via repositório do `Account`) e envia do número daquele cliente. Sem `tenantId`/credenciais → mensagem vai para DLQ com erro claro.

## 7. Camadas afetadas (Modelo B — futuro)

- [ ] Schema Prisma / migration (credenciais por Account)
- [ ] Integração externa — `src/apis/whatsapp.api.ts` (resolver credenciais por tenant)
- [ ] Repository — leitura das credenciais do Account
- [ ] Worker — passar o tenant/credenciais ao provider
- [ ] DTO/Controller/Router — onboarding (embedded signup)

## 8. Critérios de aceite (Modelo B — futuro)

- [ ] Dado dois tenants com números distintos, quando cada um dispara cobrança, então cada devedor recebe do número do **seu** fornecedor.
- [ ] Dado um tenant sem WhatsApp conectado, quando dispara cobrança, então a mensagem falha com erro claro (não vaza credencial de outro tenant).
- [ ] Token do tenant nunca é logado nem retornado em texto puro.

## 9. Riscos / considerações

- **Segurança:** token por tenant é dado sensível — criptografar em repouso e nunca logar.
- **Isolamento:** resolver credenciais **sempre** pelo `tenantId` do contexto/mensagem (risco de enviar pelo número errado).
- **Compatibilidade:** manter fallback para o `.env` global (Modelo A) enquanto ambos coexistem.
- **Meta/BSP:** virar Tech Provider tem requisitos próprios (revisão do app, políticas) — pesquisar antes.

## 10. Notas de implementação

- **Contexto pessoal (2026-07-02):** o operador não tem MEI/CNPJ e é CLT; abrir MEI tem custo mensal (DAS ~R$70-80) e **pode afetar seguro-desemprego** — confirmar com contador. Por isso a decisão de adiar: o modo `log` não exige CNPJ, e no Modelo B o CNPJ é de cada cliente. Só o Modelo A exigiria CNPJ próprio.
- Seam atual (`whatsapp.api.ts`) já isola o ponto de troca; migrar para credenciais por tenant não é reescrita.
