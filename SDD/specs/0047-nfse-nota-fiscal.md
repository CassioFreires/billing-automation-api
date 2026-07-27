# Spec 0047 — NFS-e / Nota Fiscal de Serviço — F7

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-27
- **Relacionada**: 0015 (webhook de pagamento — gatilho do auto-emitir), 0003/0019
  (seam de gateway — mesmo padrão de provider), 0012 (config por tenant). Roadmap:
  `motor-protecao-receita.md` (**F7**). Doc do provider consultada via MCP: **NFE.io**
  (REST + client Node), status `None/Created/Issued/Cancelled/Error`, webhook assinado.

## 1. Problema / Motivação

Prestador de serviço precisa **emitir NFS-e** ao receber — hoje é manual, na prefeitura.
Mas **nem toda cobrança tem nota** (mensalidade simples não; consultoria/clínica sim).
Falta emitir a nota **sozinho e seletivamente**, guardando PDF/XML.

## 2. Objetivo

Emissão de NFS-e **opt-in e seletiva** via *seam* de provider: `mock` (padrão, roda o
ciclo local sem conta real) e `nfeio` (real, por tenant). Ciclo completo: emitir
(manual e/ou automático ao receber) → processar → **emitida/erro** → **cancelar** →
PDF/XML. Nada sai sozinho a menos que o dono ligue.

Fora do v1: regimes tributários complexos, lote, carta de correção, outros providers.

## 3. Regras de negócio

- **RN-4701 (opt-in)** — Nota só existe se `FiscalSetting.enabled`. Só quem presta
  serviço com nota liga; o resto ignora.
- **RN-4702 (seletiva)** — Emissão **manual por fatura** (botão) é o padrão. Um
  toggle `autoEmitOnPaid` (**default OFF**) emite ao receber (webhook PAID) — só pra
  quem fatura 100% com nota.
- **RN-4703 (ciclo/estados)** — `pending → processing → issued | error`; `issued →
  cancelled`. `error`/`cancelled` terminais (`canTransitionFiscal`, puro). Só nota
  **emitida** cancela (`canCancelFiscal`).
- **RN-4704 (provider seam)** — `FiscalProvider` (`emit`/`cancel`/`verifyWebhook`).
  `mock` emite síncrono (volta `Issued` na hora, com PDF/XML fake). `nfeio` é
  assíncrono: emite → confirma por **webhook assinado** (HMAC `x-nfe-signature`).
  Status do provider mapeado por `mapProviderStatus`.
- **RN-4705 (1:1 + idempotência)** — 1 `FiscalDocument` por fatura (`invoiceId
  @unique`). Reemitir com nota em `processing`/`issued` devolve a existente; após
  `error`/`cancelled`, reemite no mesmo doc.
- **RN-4706 (segurança)** — `apiKey`/`webhookSecret` **cifrados** em repouso
  (AES-256-GCM), nunca retornados. Webhook resolve a nota por `providerId`
  (cross-tenant) e **verifica a assinatura** no contexto do tenant antes de aplicar.
- **RN-4707** — Escopo por tenant. Emissão valida tomador (CPF/CNPJ), valor,
  `cityServiceCode`, descrição (`validateEmission`, puro).

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260816000000_nfse_nota_fiscal`):
```prisma
model FiscalSetting {
  tenantId String @unique; enabled Boolean; provider String @default("mock")
  apiKey String?; webhookSecret String?; companyId String?; cityServiceCode String?
  autoEmitOnPaid Boolean @default(false)   // apiKey/webhookSecret cifrados
}
model FiscalDocument {   // 1:1 com Invoice
  status String @default("pending"); provider String; providerId String?
  number String?; pdfUrl String?; xmlUrl String?; message String?; amountCents Int
  issuedAt DateTime?; cancelledAt DateTime?
  invoiceId String @unique; clientId String; tenantId String
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET  /api/fiscal/settings   → { enabled, provider, companyId, cityServiceCode, autoEmitOnPaid, hasApiKey }
PUT  /api/fiscal/settings   { enabled?, provider?, apiKey?, webhookSecret?, companyId?, cityServiceCode?, autoEmitOnPaid? }
GET  /api/fiscal/documents  → [ { invoiceId, clientName, status, number, pdfUrl, ... } ]
POST /api/fiscal/invoices/:invoiceId/emit    → 201 FiscalDocument
POST /api/fiscal/invoices/:invoiceId/cancel  → 200 FiscalDocument

# Público (webhook do provider — assinatura verificada)
POST /api/fiscal/webhook/:provider  → { ignored }
```

## 6. Fluxo

- Dono liga em Configurações → Nota Fiscal (provider + `cityServiceCode` + credenciais).
- **Manual:** botão "emitir" na fatura → `emitForInvoice` → provider.emit → mock volta
  `issued` na hora; nfeio volta `processing` e confirma no webhook.
- **Auto:** no `applyWebhook` PAID, se `autoEmitOnPaid` → `maybeAutoEmit` (best-effort).
- **Webhook nfeio:** `POST /api/fiscal/webhook/nfeio` → resolve doc por `providerId` →
  verifica assinatura → atualiza status/PDF/XML (guarda de transição).
- **Cancelar:** botão (só se `issued`) → provider.cancel → `cancelled`.

## 7. Camadas afetadas

- [x] Schema/migration — `FiscalSetting`, `FiscalDocument` (+ back-relations).
- [x] Domínio — `src/domain/fiscal.ts` (estados, mapeamento, validação) + testes.
- [x] Seam — `src/apis/fiscal/` (contrato + `mock` + `nfeio` conforme doc NFE.io).
- [x] Repository — `fiscal.repository.ts` (settings cifrada, documento, webhook lookup, emissão-read).
- [x] Service — `fiscal.service.ts` (emit/cancel/maybeAutoEmit/applyWebhook/settings).
- [x] Integração — `InvoiceService.applyWebhook` PAID → `maybeAutoEmit` (best-effort).
- [x] Controller/Router — `/api/fiscal/*` (JWT) + `/api/fiscal/webhook/:provider` (público).
- [x] Frontend — Configurações → Nota Fiscal; coluna "Nota" nas Faturas (emitir/cancelar/PDF/status).
- [x] Testes — domínio (5) + serviço (10: emitir/idempotência/validação/cancelar/auto/webhook).
- [x] Contexto — `domain-model.md`, `motor-protecao-receita.md` + artefato do mapa.

## 8. Critérios de aceite

- [x] Opt-in: desligado, nenhuma nota; ligado, emissão manual seletiva funciona.
- [x] mock emite o ciclo inteiro local (issued + PDF/XML fake); nfeio implementado conforme doc.
- [x] Auto-emitir só com `autoEmitOnPaid`; webhook verifica assinatura + guarda de transição.
- [x] Só nota emitida cancela. apiKey/webhookSecret cifrados. Suíte verde (477) + build limpo.

## 9. Notas de implementação

Provider `nfeio` fiel à doc oficial (REST + webhook HMAC), mas **requer conta real**
para validar ponta a ponta — por isso o padrão é `mock`. `NFEIO_BASE_URL` configurável.
Follow-up **F7.1**: auto-emissão granular por assinatura/serviço, outros providers
(Focus/PlugNotas/eNotas), reenvio por e-mail, carta de correção.
