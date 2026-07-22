# Spec 0032 — Canais de envio (WhatsApp / E-mail)

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0013/0014 (agendador + WhatsApp por tenant), 0016 (Elo/link), 0026 (régua)

## 1. Problema / Motivação

Hoje a cobrança só sai por **WhatsApp**. Muitas PMEs cobram (também) por **e-mail**, que é mais
barato e não depende da janela/verificação da Meta. O dono precisa **escolher o canal** que já
usa, sem perder a automação da régua.

## 2. Objetivo

Deixar o tenant escolher **por onde a régua dispara**: WhatsApp, e-mail ou ambos — mantendo tudo
**mock-first** (o e-mail real fica para quando houver clientes, mesma política do WhatsApp/gateway).

- **Em escopo:** preferência de canal por tenant; `Client.email` opcional (form + import CSV);
  seam de e-mail com provider `log` (mock); worker ramifica por canal; **fallback** para WhatsApp
  quando o cliente não tem e-mail; evento `sent` por canal.
- **Fora de escopo:** envio de e-mail **real** (SMTP/SendGrid/SES) — só o contrato/seam; templates
  de e-mail ricos (HTML); SMS; canal por **cliente** (é por tenant nesta versão).

## 3. Regras de negócio

- **RN-3201** — Preferência por tenant: `whatsapp` (padrão) | `email` | `both`.
- **RN-3202** — `email` sem e-mail no cliente → **fallback** para WhatsApp (nunca deixa de cobrar).
  O telefone é obrigatório no cliente, então o WhatsApp é sempre um destino disponível.
- **RN-3203** — `both` envia WhatsApp **e** e-mail; o e-mail só entra quando o cliente tem um.
- **RN-3204** — Sucesso em **qualquer** canal marca a fatura como notificada; falha em **todos**
  os canais → erro (nack → retry → DLQ), como antes.
- **RN-3205** — Cada envio registra um evento `sent` com o `channel` real (whatsapp|email) e o provider.
- **RN-3206** — E-mail é **mock-first**: provider `log` não envia de verdade (default seguro).

## 4. Impacto no modelo de dados

- `Client.email String?` (opcional).
- `ChannelSetting` (novo, por tenant): `channel @default("whatsapp")`, `tenantId @unique`.
- Migration aditiva idempotente `20260730000000_canais_envio`.

## 5. Contrato de API

```
GET /api/settings/channel   (JWT) → { channel: "whatsapp"|"email"|"both" }
PUT /api/settings/channel   (JWT) → { channel }         (whatsapp por padrão)

# Cliente (existentes) agora aceitam email opcional:
POST /api/clients            { name, phone, document, email? }
PUT  /api/clients/:id        { ..., email? }            (null limpa o e-mail)
POST /api/clients/import     { clients: [{ ..., email? }] }
```

## 6. Fluxo / Processamento

- **Config:** dono escolhe o canal em Configurações → `ChannelSettingService`.
- **Agendador (spec 0013/0026):** inalterado — só enfileira as faturas devidas.
- **Worker (`invoice.worker`):** por fatura, resolve `channels = resolveChannels(preferido, {hasEmail})`
  (domínio puro `domain/channels.ts`); para cada canal envia (WhatsApp por tenant / `EmailAPI` mock),
  registra `sent` por canal e marca notificada se **algum** canal deu certo.

## 7. Camadas afetadas

- [x] Schema/migration — `Client.email`, `ChannelSetting`
- [x] Domínio — `domain/channels.ts` (`resolveChannels`, `NotifyChannel`), seam `apis/email.api.ts`
- [x] DTO — `channelSettings.dto.ts`; `email` em create/update/import de cliente
- [x] Repository — `channel-setting.repository.ts`; `email` em import e `findNotificationDataById`
- [x] Service — `channel-setting.service.ts`
- [x] Controller/Router — `settings.controller` + `GET/PUT /settings/channel`
- [x] Worker — `invoice.worker` ramifica por canal (whatsapp/email + fallback)
- [x] Frontend — seção "Canal de envio" (Configurações), campo e-mail no cliente + import CSV

## 8. Critérios de aceite

- [x] Canal `whatsapp` → só WhatsApp; `email` com e-mail → só e-mail; `email` sem e-mail → WhatsApp.
- [x] Canal `both` com e-mail → dois envios (dois eventos `sent`); sem e-mail → só WhatsApp.
- [x] E-mail em modo `log` não envia de verdade (só registra).
- [x] Suíte verde (API 302; +`channels.test`, +`email.api.test`) e build web limpo.

## 9. Riscos / considerações

- **E-mail real** exige provider (SMTP/SendGrid/SES), remetente verificado (SPF/DKIM) e template —
  fora de escopo por decisão de produto (sem clientes ainda). O seam já isola isso via `EMAIL_PROVIDER`.
- **Deliverability/opt-out** (LGPD/anti-spam) entra junto do provider real.

## 10. Notas de implementação

- Espelha o padrão do WhatsApp por tenant (spec 0014): seam com provider `log` default e resolução
  por env. `resolveChannels` é função pura testada (7 casos). Follow-ups: canal por **cliente**,
  templates de e-mail (assunto/HTML), provider real e SMS.
