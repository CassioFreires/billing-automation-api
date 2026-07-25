# Spec 0045 — Winback / reativação automática — F5

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-24
- **Relacionada**: 0033 (recuperação — padrão do sweep/enfileiramento), 0037/0038
  (retenção/desconto), 0016 (Elo — link de pagamento), 0015 (webhook). Roadmap:
  `motor-protecao-receita.md` (**F5** — fecha a tríade do churn).

## 1. Problema / Motivação

O motor já **recupera** pagamento falho (F1) e **segura** no cancelamento (F11). Falta
a 3ª ponta: **trazer de volta** quem já saiu. Cliente com assinatura **cancelada** some
sem nenhuma tentativa automática de retorno — dinheiro deixado na mesa.

## 2. Objetivo

Sequência de retorno automática: quem cancela, X dias depois recebe **sozinho** uma
oferta de volta com desconto (um **link de cobrança** da 1ª mensalidade de volta). Se
pagar, reativou. Métrica de "reativados" para o dono.

Fora do v1: múltiplos passos (v1 = 1 disparo), A/B de mensagem, winback por e-mail,
reativação automática da recorrência (v1 entrega o **link de cobrança**; recriar a
assinatura fica com o dono/F5.1).

## 3. Regras de negócio

- **RN-4501** — Elegível = assinatura com `status='CANCELED'` sem `WinbackCase`. O
  sweep **inscreve** (cria o caso, `eligibleAt=now`) — o relógio começa ao ser notado
  (não depende de um "cancelado em" confiável).
- **RN-4502** — Dispara quando `now >= eligibleAt + daysAfter` (config; default 15).
  Uma oferta por assinatura (`WinbackCase.subscriptionId @unique`), idempotente.
- **RN-4503** — Valor da oferta = `amount` da assinatura com `discountPercent` (0..90,
  default 10) aplicado (`winbackChargeValue`, puro). Gera **cobrança separada**
  (reserva→gateway→anexa, padrão do 0018/0044) e enfileira a mensagem no invoice worker.
- **RN-4504** — Sem telefone ou valor ≤ 0 → caso `skipped` (não cobra). Falha no
  gateway → best-effort: loga e conta como skipped (não derruba o sweep).
- **RN-4505** — "Reativado" = a cobrança de retorno (`WinbackCase.invoiceId`) está
  `PAID`. Métrica derivada (sem hook no webhook).
- **RN-4506** — Só roda com `WinbackSetting.enabled`. Escopo por tenant. Sweep no cron
  diário (por último, NÃO-FATAL).

## 4. Impacto no modelo de dados

Migration **aditiva idempotente** (`20260814000000_winback_reativacao`):
```prisma
model WinbackSetting {
  tenantId String @unique; enabled Boolean @default(false)
  daysAfter Int @default(15); discountPercent Int @default(10); message String?
}
model WinbackCase {
  status String @default("pending") // pending | sent | skipped
  eligibleAt DateTime; sentAt DateTime?
  subscriptionId String @unique; invoiceId String? @unique; clientId String; tenantId String
}
```

## 5. Contrato de API

```
# Dono (JWT)
GET /api/winback/settings   → { enabled, daysAfter, discountPercent, message }
PUT /api/winback/settings   { enabled?, daysAfter?, discountPercent?, message? }
GET /api/winback/summary    → { total, pending, sent, reactivated }

# Sistema (x-cron-secret)
POST /api/system/winback/run  → { tenants, enrolled, sent, skipped }
```

## 6. Fluxo

```
[cron — último passo, depois do sweep de acesso]
  POST /api/system/winback/run
   → WinbackService.runAllTenants → por tenant (se enabled):
       (a) inscreve assinaturas CANCELED sem caso (eligibleAt=now)
       (b) dispara casos com eligibleAt <= now - daysAfter:
             valor = amount × (1 - desconto) → cria cobrança (gateway) →
             enfileira mensagem (Elo /pagar) no invoice worker → markSent
```
O cliente recebe a mensagem + link, paga → `reactivated` na métrica (fatura PAID).

## 7. Camadas afetadas

- [x] Schema/migration — `WinbackSetting`, `WinbackCase` (+ back-relations Subscription/Invoice/Client/Account).
- [x] Domínio — `src/domain/winback.ts` (`isDueForWinback`, `winbackChargeValue`, `buildWinbackMessage`, clamps) + testes.
- [x] Repository — `winback.repository.ts` (settings, enroll, due, markSent/Skipped, summary).
- [x] Service — `winback.service.ts` (`runAllTenants` sweep, settings, summary).
- [x] System controller/router — `POST /api/system/winback/run` + passo 6 no cron (não-fatal).
- [x] Controller/Router dono — `/api/winback/settings` + `/summary`.
- [x] Frontend — Configurações → Winback (ligar/dias/desconto/mensagem) + resumo (enviados/fila/reativados).
- [x] Testes — domínio (8) + serviço (6: enroll, dispatch com desconto, skip sem fone, dentro da janela, desligado, clamp).
- [x] Contexto — `domain-model.md`, `motor-protecao-receita.md`, `fluxo-completo.md`.

## 8. Critérios de aceite

- [x] Inscreve canceladas sem caso; só dispara após a janela; idempotente (1 por assinatura).
- [x] Cobrança de retorno = valor com desconto; mensagem enfileirada com link do Elo.
- [x] Sem telefone → skipped. Reativado = fatura de retorno paga. Suíte verde + build limpo.

## 9. Notas de implementação

Reusa o padrão do RecoveryService (sweep cross-tenant + `queueOverdueInvoices`) e a
criação de cobrança do 0044/0018. Follow-up **F5.1**: multi-passo, winback também
para recovery `lost`, e reativação automática da recorrência.
