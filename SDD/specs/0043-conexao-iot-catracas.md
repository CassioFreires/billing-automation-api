# Spec 0043 — Conexão IoT/Catracas (API + Webhooks de saída) — F13

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0042 (F12 — estado de acesso; **produtor** do `granted` que aqui é
  consumido), 0040/0041 (Contrato), 0035 (Radar), 0010/0033/0035 (cron diário).
  Roadmap: `motor-protecao-receita.md` (**F13**).

## 1. Problema / Motivação

O F12 **decide** o estado de acesso (`allowed`/`grace`/`blocked`) por cliente, mas
não age no mundo real. Falta a "tomada": uma porta padronizada onde catraca,
fechadura ou plataforma de streaming (a) **perguntam** se um cliente pode entrar e
(b) **são avisados** quando o acesso muda. Sem isso, o motivo mais forte para pagar
(perder o acesso) não se materializa fisicamente.

## 2. Objetivo

Entregar o **contrato genérico** de integração (não conector de marca específica):
- **PULL** — endpoint autenticado por **API key** por tenant: a máquina consulta e
  recebe a decisão do F12.
- **PUSH** — **webhook de saída assinado (HMAC)**: quando o acesso de um cliente
  **transiciona**, o Adimplo avisa o sistema do parceiro.
- **Log** append-only de cada transição (auditoria + status de entrega do webhook).

Fora do v1: conectores de marca; fila de retry sofisticada (1 tentativa + log);
rotação automática de chave (gerar/revogar é manual).

## 3. Regras de negócio

- **RN-4301** — A API key é guardada só como **hash** (sha256); a chave crua é
  exibida **uma vez** na geração. Prefixo (`adk_…`) guardado só para exibição.
- **RN-4302 (auth máquina)** — `GET /access/check` autentica por `x-api-key`
  (não JWT). Resolve o tenant pelo hash da chave. **Falha fechado**: chave ausente/
  inválida ou integração desligada → 401 genérico (não revela o motivo).
- **RN-4303 (decisão)** — `check` devolve exatamente o veredito do F12
  (`decideAccess`): `{ granted, state, reason }`. A "tomada" não reimplementa regra.
- **RN-4304 (transição)** — Estado propagado guardado em `Client.accessState`. O
  **sweep diário** recomputa; se `state !== accessState` (baseline = `allowed`) →
  registra `AccessEvent` e, se configurado, dispara o webhook. Idempotente entre
  sweeps (sem mudança = nada).
- **RN-4305 (assinatura)** — Webhook assinado por **HMAC-SHA256** de
  `${timestamp}.${corpo}` com o `webhookSecret` do tenant. Headers
  `x-adimplo-signature: sha256=…` + `x-adimplo-timestamp`. O receptor valida a
  assinatura e a janela (anti-replay). Segredo visível ao dono (para validar do lado dele).
- **RN-4306 (best-effort)** — Disparo do webhook nunca derruba o sweep: 1 tentativa,
  timeout curto; o resultado (`sent`/`failed`/`skipped` + HTTP code) vai pro log.
- **RN-4307** — Requer o F12 ligado para bloquear de fato; integração desligada não
  responde nem dispara. Escopo por tenant.

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260812000000_conexao_iot_catracas`):
```prisma
model AccessIntegration {
  tenantId      String  @id   // 1:1 com Account
  enabled       Boolean @default(false)
  apiKeyHash    String?        // sha256(chave) — nunca a chave crua
  apiKeyPrefix  String?        // "adk_…" para exibir
  webhookUrl    String?
  webhookSecret String?        // segredo HMAC
}
model AccessEvent {              // append-only
  fromState String?  toState String  granted Boolean  reason String
  webhookStatus String  webhookCode Int?  clientId String  tenantId String  createdAt DateTime
}
// Client ganha: accessState String?  // último estado propagado (base do diff)
```

## 5. Contrato de API

```
# Dono (JWT)
GET    /api/access/integration                    → { enabled, hasApiKey, apiKeyPrefix, webhookUrl, webhookConfigured, webhookSecret }
PUT    /api/access/integration                    { enabled }
POST   /api/access/integration/api-key/rotate     → { apiKey (crua, 1x), apiKeyPrefix }
POST   /api/access/integration/api-key/revoke     → integração
PUT    /api/access/integration/webhook            { webhookUrl } → integração (gera secret se faltar)
DELETE /api/access/integration/webhook            → integração
POST   /api/access/integration/webhook/test       → { status, code? } (dispara payload de exemplo)
GET    /api/access/events?limit=                  → [ { clientName, fromState, toState, webhookStatus, ... } ]

# Máquina (x-api-key)
GET    /api/access/check?client=<id>              → { clientId, state, granted, reason }

# Sistema (x-cron-secret)
POST   /api/system/access/run                     → sweep de transição + webhooks (200)
```

Payload do webhook (POST na `webhookUrl`):
```json
{ "clientId","clientName","state","granted","previousState","reason","at" }
```

## 6. Fluxo

- **PULL:** catraca → `GET /check` (x-api-key) → middleware resolve tenant pelo hash
  → `computeClientAccess` roda `decideAccess` do F12 → `{ granted, ... }`.
- **PUSH:** cron chama `/system/access/run` (por último, depois do Radar) →
  `runAllTenants` → por tenant, `findAccessInputs` + `decideAccess`; nas transições
  grava `AccessEvent`, dispara webhook assinado (se configurado) e atualiza
  `Client.accessState`.

## 7. Camadas afetadas

- [x] Schema/migration — `AccessIntegration`, `AccessEvent`, `Client.accessState`.
- [x] Domínio — `src/domain/webhook-signature.ts` (HMAC assinar/verificar) + testes.
- [x] Seam — `src/apis/access-webhook.api.ts` (fetch + timeout, best-effort).
- [x] Repositórios — `access-integration.repository.ts` (config/eventos/lookup) + `access.repository.ts` (estado por cliente, `findAccessInputs(clientId?)`).
- [x] Service — `access-integration.service.ts` (config, `computeClientAccess`, `runAllTenants` sweep).
- [x] Middleware — `access-api-key.middleware.ts` (x-api-key → tenant).
- [x] Controller/Router — `/api/access/integration*`, `/api/access/check`, `/api/access/events`, `/api/system/access/run`.
- [x] Cron — passo 5 em `run-daily-billing.sh` (não-fatal).
- [x] Frontend — Configurações → **Integrações** (API key + webhook + teste + log).
- [x] Testes — assinatura HMAC (8) + serviço/sweep (8).
- [x] Contexto — `domain-model.md`, `motor-protecao-receita.md`, `fluxo-completo.md`.

## 8. Critérios de aceite

- [x] `check` devolve o veredito do F12; chave inválida/desligada → 401 genérico.
- [x] Sweep: baseline (cliente novo em dia) não gera evento; transição real gera
  evento + webhook; idempotente entre sweeps.
- [x] Webhook assinado (HMAC de `ts.corpo`), verificável; anti-replay por janela.
- [x] API key só como hash; chave crua exibida 1x. Suíte verde + build limpo.

## 9. Notas de implementação

Sem `Date.now()` proibido aqui (isso é regra de workflow-script, não de app). Retry
de webhook e conectores de marca ficam para o **F13.1** sob demanda de piloto.
