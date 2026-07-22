# Spec 0026 — Régua de cobrança multi-passo

- **Status**: Implementada
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-21
- **Relacionada**: spec 0013 (agendador de notificações), 0014 (WhatsApp por tenant), 0016 (Elo)

## 1. Problema / Motivação

Hoje o agendador diário enfileira **uma** notificação por fatura vencida a cada execução, sem
cadência nem controle: não há "lembrete 3 dias antes", "no vencimento", "3 dias depois". Uma
**régua** configurável (sequência de lembretes ao longo do tempo) é o que transforma cobrança
manual em automática — e aumenta a recuperação (spec 0025).

## 2. Objetivo

Permitir que cada tenant configure uma **régua de passos** (offset em dias relativo ao
vencimento + mensagem) e que o agendador diário envie **o passo certo, uma vez cada**.

- **Em escopo:** `ReguaSetting` por tenant (liga/desliga + passos); rastreio de passo por fatura
  (`reminderStep`/`lastReminderAt`); seleção de passo no agendador; mensagem por passo com
  variáveis `{nome}`/`{valor}`; UI de configuração nas Configurações.
- **Fora de escopo:** régua por canal SMS/e-mail (só WhatsApp/log hoje); templates aprovados da
  Meta (segue como limitação do provider cloud); janelas por horário/dia útil.

## 3. Regras de negócio

- **RN-2601** — A régua é **por tenant**: `enabled` + `steps[]`, cada passo `{ offsetDays, message? }`.
  `offsetDays` é relativo ao vencimento (negativo = antes, 0 = no dia, positivo = depois).
- **RN-2602** — Os passos são **ordenados por offset crescente**; o passo N (1-based) é o
  N-ésimo da lista.
- **RN-2603** — Cada fatura guarda `reminderStep` (quantos passos já enviados) e `lastReminderAt`.
  O agendador envia **o próximo passo não enviado** cujo `offsetDays <= diasDesdeVencimento`
  (um passo por execução/fatura). Assim a cadência se distribui ao longo dos dias.
- **RN-2604** — Só faturas **em aberto** (PENDING/OVERDUE, não pagas/renegociadas) entram na régua.
- **RN-2605** — A mensagem do passo aceita `{nome}` e `{valor}`; se vazia, usa o texto padrão.
  A linha de pagamento (link do Elo / checkout / PIX) é **sempre** anexada.
- **RN-2606** — Régua **desligada** ⇒ comportamento legado (enfileira os vencidos como antes),
  para não quebrar quem não configurou.
- **RN-2607** — Reenvio idempotente por passo: rodar o agendador 2× no mesmo dia não repete o
  mesmo passo (o `reminderStep` avança só quando o envio é enfileirado).

## 4. Impacto no modelo de dados

- `Invoice.reminderStep Int @default(0)`, `Invoice.lastReminderAt DateTime?`.
- Novo `ReguaSetting` (padrão dos settings 1:1): `enabled Boolean`, `steps Json`, `tenantId @unique`.
- Migration aditiva idempotente `20260728000000_regua_multipasso`.

## 5. Contrato de API

```
GET  /api/settings/regua   (JWT) → { enabled, steps: [{offsetDays, message}] }
PUT  /api/settings/regua   (JWT) → mesmo corpo (valida offsets crescentes, 1..6 passos)
POST /api/system/notifications/run  (cron) → agora aplica a régua por tenant
```

## 6. Fluxo / Processamento

1. `NotificationSchedulerService.runAllTenants()` por tenant: carrega `ReguaSetting`.
2. **Régua ligada:** `InvoiceRepository.findReguaCandidates()` (abertas, com `dueDate`,
   `reminderStep`). Para cada uma, `selectDueStep(offsets, diasDesdeVencimento, reminderStep)`:
   - se há passo devido → enfileira com `message` (variáveis aplicadas) + `step`; marca
     `reminderStep=step`, `lastReminderAt=now`.
3. **Régua desligada:** caminho legado (`findPendingInvoices` → enfileira).
4. Worker: usa `data.message` como intro (senão texto padrão), envia, marca o passo e grava
   `sent` com `metadata.step`.

## 7. Camadas afetadas

- [x] Schema/migration — `Invoice.reminderStep/lastReminderAt` + `ReguaSetting`
- [x] Domain — `src/domain/regua.ts` (selectDueStep, daysFromDue, applyTemplate, DEFAULT_REGUA_STEPS)
- [x] DTO — `src/dtos/reguaSettings.dto.ts`; `triggerNotification.dto` (+message/step)
- [x] Repository — `regua-setting.repository.ts`; `invoice.repository` (findReguaCandidates, markReminderStep)
- [x] Service — `regua-setting.service.ts`; `notification-scheduler.service` (passo); worker
- [x] Controller/Router — `settings.controller`/`settings.router` (+/regua)
- [x] Frontend — seção "Régua de cobrança" nas Configurações + service/hook

## 8. Critérios de aceite

- [ ] Configurar régua com passos -3/0/3/7 e enviar: cada run avança um passo devido.
- [ ] Fatura paga sai da régua; passo não repete no mesmo dia.
- [ ] Mensagem com `{nome}`/`{valor}` é substituída; link de pagamento sempre presente.
- [ ] Régua desligada → comportamento legado inalterado.

## 9. Riscos / considerações

- **Template Meta:** passos fora da janela de 24h exigem template aprovado (limitação do provider
  cloud, já documentada) — em `log`/teste não afeta.
- **Um passo por run:** se o cron rodar 1×/dia, a cadência é diária; catch-up é gradual.

## 10. Notas de implementação

- **Domínio puro** `regua.ts` (`selectDueStep`, `daysFromDue`, `applyTemplate`) testado isolado.
- **Agendador** ganhou branch: régua ligada → `findReguaCandidates` + seleção de passo +
  `markReminderStep` (avança no enfileiramento, idempotente por passo); desligada → legado
  intacto. `now` injetável para teste.
- **Worker:** `buildChargeMessage` aceita `intro` (texto do passo); a linha de pagamento é
  sempre anexada. Quando vem `step`, o passo já foi avançado pelo agendador (não re-marca).
  Evento `sent` guarda `metadata.step`.
- **Front:** seção "Régua de cobrança" nas Configurações (liga/desliga, passos com offset+
  mensagem, sugestão inicial, validação de offsets crescentes).
- **Testes:** `regua` (domínio, 9) + scheduler régua/legado. Suíte API: 280 verdes.
- **Follow-ups:** template aprovado da Meta para passos fora da janela 24h; janela por horário;
  atribuição por canal na métrica de recuperação (liga com 0025).
