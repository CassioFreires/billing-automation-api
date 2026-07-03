# Spec 0014 — Configuração de WhatsApp por tenant

- **Status**: Implementada (backend + frontend); envio real depende da verificação Meta
- **Autor**: Cassio
- **Data**: 2026-07-03
- **Relacionada**: [0012 pagamento por tenant], [0005 modelo de remetente], seam `whatsapp.api.ts`, invoice worker

## 1. Problema / Motivação

Como no pagamento, **cada empresa envia pelo próprio número de WhatsApp** (seu CNPJ/credenciais na Meta). O provider era global (`.env`), servindo a um único remetente. Precisamos de config **por tenant**, deixando a estrutura pronta para quando a **verificação de negócio da Meta** liberar o envio (hoje travado no erro 130497).

## 2. Objetivo

Cada tenant escolhe `log` (não envia) ou `cloud` (Meta Cloud API com as credenciais dele). O worker resolve o provider **do tenant** ao enviar. Envio real fica **desligado por padrão** (`log`).

## 3. Regras de negócio

- RN-W1: 1 config por tenant (`WhatsappSetting.tenantId` único).
- RN-W2: `provider=cloud` exige `phoneNumberId` e `token`; sem eles, o worker **cai em `log`** (nunca quebra o envio).
- RN-W3: **token é secreto** — a API o aceita na escrita, mas **nunca** o devolve (GET mascarado: `hasToken: boolean`). Salvar sem reenviar o token **mantém** o atual.
- RN-W4: Sem config salva, usa o provider global do `.env` (compat) — default `log`.
- RN-W5: O worker resolve o provider **por mensagem**, dentro de `runWithTenant`, pela config do tenant.

## 4. Modelo de dados

`WhatsappSetting { id, provider (log|cloud), phoneNumberId?, token?, apiVersion?, createdAt, lastUpdate, tenantId @unique }`. 1-1 com `Account`. Migração aditiva/idempotente.

## 5. Contrato de API

```
GET /api/settings/whatsapp                        (JWT)
Response: 200 { provider, phoneNumberId, apiVersion, hasToken }   # SEM token

PUT /api/settings/whatsapp                        (JWT)
Body: { provider: "log"|"cloud", phoneNumberId?, token?, apiVersion? }
Response: 200 { ...mascarado }
```

## 6. Fluxo

Envio: invoice worker (dentro de `runWithTenant`) → `WhatsappSettingService.getForCurrentTenant()` → `resolveWhatsappForTenant(config)` → `LogOnly` ou `CloudApiWhatsappProvider({ token, phoneNumberId })` do tenant.

## 7. Camadas afetadas

- [x] Schema/migration — `WhatsappSetting`
- [x] `whatsapp.api.ts` — `resolveWhatsappForTenant(config)` + `TenantWhatsappConfig`
- [x] DTO/Repository/Service — settings (upsert que preserva token; getMasked)
- [x] Controller/Router — `/api/settings/whatsapp` (GET/PUT)
- [x] Worker — resolve provider por tenant por mensagem
- [x] Testes — resolução (log/cloud), mascaramento do token
- [x] Frontend — seção WhatsApp na tela de Configurações
- [ ] Envio real — depende da verificação Meta + suporte a template (D-02, spec 0005)

## 8. Critérios de aceite

- [x] `PUT /settings/whatsapp` salva provider + phoneNumberId + token (token nunca volta no GET).
- [x] `cloud` sem phoneNumberId → 400.
- [x] Salvar sem token mantém o token anterior.
- [x] Worker usa o número do tenant; sem credenciais, `log` (não envia).
- [ ] Mensagem real entregue (pós-verificação Meta).

## 9. Riscos / considerações

- **Segredo em repouso**: token em texto no banco. Aceitável pré-lançamento (poucos tenants) e **mascarado na API**; antes de multi-tenant em produção, **criptografar** (mesma pendência do token MP).
- **Regra da Meta**: fora da janela de 24h, cobrança exige **template aprovado** (`type: template`). O provider atual envia **texto** — cobre teste/janela; template é evolução (spec 0005).

## 10. Notas

Implementado em 2026-07-03. Estrutura por tenant pronta; basta o tenant informar número/token e trocar para `cloud` quando a Meta liberar. Default `log` mantém tudo seguro até lá.
