# Spec 0050 — White-label: cor de marca por cliente (Fase 3)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-27
- **Relacionada**: 0048 (tokenização do design — pré-requisito), 0016/0018 (Elo),
  0027 (Portal), 0046 (indicação). Fase 3 do plano de produto.

## 1. Problema / Motivação

O contratante quer o sistema com a **cara dele**. Como a Fase 1 (0048) tokenizou
todas as cores (`--color-brand-*`), dá pra deixar cada tenant escolher **a cor de
marca dele** — e ela recolore o painel **e as páginas públicas** (o que o cliente
final vê). Alto impacto de percepção ("o sistema é meu"), baixo risco.

## 2. Objetivo

Cada tenant define **uma cor de marca** (hex). Aplicada em runtime sobrescrevendo os
tokens `--color-brand-primary` / `--color-brand-hover` (hover derivado por clareamento).
Como tudo usa esses tokens, uma linha recolore o app inteiro.

Escopo v1: **só a cor** (accent). Logo e domínio próprio ficam pra depois.

## 3. Regras de negócio

- **RN-5001** — `BrandSetting` (1 por tenant): `brandColor` hex (default `#14a08a`).
  Validação/normalização **pura** (`normalizeBrandColor`: aceita #rgb/#rrggbb → #rrggbb).
- **RN-5002 (painel)** — Ao autenticar, o painel busca a cor do tenant e aplica
  (`useApplyBrand` no `AppShell`).
- **RN-5003 (públicas)** — As páginas públicas resolvem a cor pelo **token da fatura/
  portal/indicação** (o backend injeta `brandColor` no payload de `getOptions` do Elo,
  do Portal e do `publicInfo` da indicação). O front aplica no carregamento.
- **RN-5004** — Hover derivado da primária (clareia ~16%) — o dono escolhe 1 cor só.

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260817000000_white_label`):
```prisma
model BrandSetting {
  tenantId String @unique
  brandColor String @default("#14a08a")
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET /api/brand/settings   → { brandColor }
PUT /api/brand/settings   { brandColor } → { brandColor }  (valida hex)

# Público (payloads existentes ganham brandColor)
GET /api/public/agreements/:token/options  → { ..., brandColor }
GET /api/public/portal/:token              → { ..., brandColor }
GET /api/public/referrals/:code            → { ..., brandColor }
```

## 6. Camadas afetadas

- [x] Schema/migration — `BrandSetting`.
- [x] Domínio — `src/domain/brand.ts` (`normalizeBrandColor`) + testes.
- [x] Repo/Service/Controller/Router — `/api/brand/settings` (JWT) + `getColorByTenant` (público).
- [x] Público — `brandColor` em `negotiation.getOptions`, `portal.getByToken`, `referral.publicInfo`.
- [x] Frontend — `lib/brand.ts` (`applyBrand`/`lighten`/`normalizeHex`), `useApplyBrand` no AppShell,
  aplicação nas 3 públicas, Configurações → **Marca** (presets + hex + preview ao vivo).
- [x] Testes — domínio (3) + mocks de brand nos testes de negotiation/portal. Suíte 480 verde.

## 7. Critérios de aceite

- [x] Dono muda a cor em Configurações → Marca; painel recolore na hora (preview ao vivo + salvar).
- [x] Páginas públicas (pagar/portal/indicação) usam a cor do tenant.
- [x] Hex inválido é recusado (400). Build limpo.

## 8. Notas

Contraste: presets são cores médias que funcionam com texto branco nos botões.
Follow-up (F white-label.1): **logo** por tenant e **domínio próprio** (DNS/cert).
Tema claro do painel também é follow-up (hoje dark-only).
