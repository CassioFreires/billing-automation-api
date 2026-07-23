# Roteiro de Homologação — Adimplo

> Roteiro para **validar o sistema ponta a ponta** antes de captar clientes
> reais. Cada caso tem: pré-condição, passos, resultado esperado e critério de
> aceite. Marque ✅/❌ ao executar.
>
> **Complementa:** `postman/GUIA-DE-TESTES.md` + coleção Postman
> (`postman/billing-automation.postman_collection.json`) e o
> `SDD/artifacts/guia-de-testes.html`. Este documento é a **camada de negócio**
> (o que provar), aqueles são o **como chamar cada endpoint**.

---

## 0. Ambiente de homologação (custo zero)

| Componente | Modo de homologação | Custo |
|---|---|---|
| Pagamento | gateway `mock` (fluxo E2E) **ou** InfinitePay real do tenant | R$ 0 (mock) |
| WhatsApp | `WHATSAPP_PROVIDER=cloud` + **número de teste da Meta** (até 5 destinos) | R$ 0 |
| E-mail | provider real (Resend/Brevo free) **ou** Mailtrap (sandbox) | R$ 0 |
| Infra | ambiente atual (`useadimplo.com.br`) ou VPS de teste | atual |

**Pré-setup:**
1. `.env` com `JWT_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`,
   `RABBITMQ_URL` configurados.
2. WhatsApp: obter token temporário + `WHATSAPP_PHONE_NUMBER_ID` no painel Meta;
   cadastrar seu número em "To".
3. E-mail: provider SMTP **já implementado** (`SmtpEmailProvider`, nodemailer).
   Para o teste real: `EMAIL_PROVIDER=smtp` + `SMTP_HOST/PORT/USER/PASS` +
   `EMAIL_FROM` (conta Resend/Brevo/Mailtrap). Sem essas envs, roda em `log`.

---

## Fase 1 — Fundação (conta, auth, multi-tenancy)

### HM-01 · Cadastro e login
- **Passos:** `/register` (empresa + e-mail + senha + aceite) → `/login`.
- **Esperado:** conta criada, JWT emitido, redireciona ao Dashboard.
- **Aceite:** ✅ login inválido é rejeitado; ✅ aceite LGPD gravado com data+versão.

### HM-02 · Isolamento entre tenants
- **Passos:** criar 2 contas; em cada uma, criar um cliente.
- **Esperado:** conta A **não** enxerga o cliente da conta B.
- **Aceite:** ✅ nenhuma query vaza dados entre tenants.

---

## Fase 2 — Cadastro e cobrança

### HM-03 · Cadastro de cliente (avulso + CSV)
- **Passos:** criar cliente manual; depois importar CSV (com e sem e-mail).
- **Esperado:** upsert por telefone; e-mail opcional aceito.
- **Aceite:** ✅ telefone duplicado no mesmo tenant não cria duplicata.

### HM-04 · Cobrança avulsa
- **Passos:** `/invoices` → Nova (valor, vencimento, itens).
- **Esperado:** fatura nasce `PENDING` com `gatewayId` + PIX/checkout.
- **Aceite:** ✅ a cobrança passou pelo gateway (tem `gatewayId`).

### HM-05 · Assinatura recorrente
- **Passos:** criar assinatura mensal; rodar `POST /api/subscriptions/run`.
- **Esperado:** gera a fatura da competência; rodar de novo **não** duplica.
- **Aceite:** ✅ idempotência por `[subscriptionId, period]`.

### HM-06 · Import de faturas (CSV)
- **Passos:** subir planilha de faturas.
- **Esperado:** faturas criadas, cliente resolvido pelo telefone.
- **Aceite:** ✅ linhas inválidas reportadas, válidas criadas.

---

## Fase 3 — Notificação e canais

### HM-07 · Disparo e fila
- **Passos:** `POST /api/notifications/trigger-overdue` com uma fatura.
- **Esperado:** API responde **202** na hora; mensagem entra na fila; worker
  processa e marca `notificationSent`.
- **Aceite:** ✅ log do worker mostra `Invoice recebida` → `Processado`.

### HM-08 · WhatsApp real (número de teste)
- **Pré:** `WHATSAPP_PROVIDER=cloud` + número de teste + seu número em "To".
- **Passos:** disparar cobrança para o seu número.
- **Esperado:** a mensagem **chega** no seu WhatsApp com o link do Adimplo (`/r/:token`).
- **Aceite:** ✅ mensagem entregue, custo zero.

### HM-09 · E-mail real (SMTP)
- **Pré:** `EMAIL_PROVIDER=smtp` + envs SMTP + remetente verificado (SPF/DKIM).
- **Passos:** canal `email`, cliente com e-mail → disparar.
- **Esperado:** e-mail **chega** com assunto "Cobrança em aberto — {cliente}".
- **Aceite:** ✅ chega na caixa (não spam); ✅ SPF/DKIM ok.

### HM-10 · Canal e fallback
- **Passos:** canal `email` com cliente **sem** e-mail; canal `both` com e-mail.
- **Esperado:** sem e-mail → cai para WhatsApp; `both` → dois envios (dois eventos `sent`).
- **Aceite:** ✅ nunca deixa de cobrar; ✅ um evento `sent` por canal.

### HM-11 · Resiliência (DLQ)
- **Passos:** forçar falha de envio (ex.: credencial inválida) e observar.
- **Esperado:** `nack` → requeue → após 5 tentativas vai para a DLQ.
- **Aceite:** ✅ cobrança que falhou **não some** silenciosamente.

---

## Fase 4 — Pagamento e conciliação

### HM-12 · Webhook / baixa automática
- **Passos:** simular pagamento (`mock`: `POST /api/invoices/webhook` com
  `x-webhook-secret`).
- **Esperado:** fatura vira `PAID` + `paidAt`.
- **Aceite:** ✅ reenviar o **mesmo** evento **não** reprocessa (idempotência).

### HM-13 · Baixa manual
- **Passos:** fatura → **Dar baixa** (meio + data).
- **Esperado:** fatura vira `PAID`, aparece nos recebimentos.
- **Aceite:** ✅ `PAID` não regride (máquina de estados).

### HM-14 · Elo (comportamento)
- **Passos:** abrir o link `/r/:token` do pagador.
- **Esperado:** registra evento `open` e redireciona ao pagamento.
- **Aceite:** ✅ evento gravado (base da autonegociação/Cockpit).

---

## Fase 5 — Recuperação e visão

### HM-15 · Autonegociação (Botão de Alívio)
- **Passos:** configurar regras; simular várias aberturas sem pagar em `/pagar/:token`.
- **Esperado:** ofertas (desconto/parcelar/adiar) aparecem; aceitar gera **nova
  cobrança**.
- **Aceite:** ✅ acordo cria fatura nova pelo gateway (supersede).

### HM-16 · Portal do pagador
- **Passos:** abrir `/portal/:token`.
- **Esperado:** lista todas as cobranças do cliente (aberto + histórico).
- **Aceite:** ✅ sem login; ✅ não expõe dados sensíveis/anonimizados.

### HM-17 · Cockpit
- **Passos:** abrir `/dashboard`.
- **Esperado:** KPIs (a receber/a vencer/em atraso/recebido), aging, **valor
  recuperado**, fila de ações.
- **Aceite:** ✅ números batem com as faturas cadastradas.

---

## Fase 6 — Plataforma e conformidade

### HM-18 · Console (super-admin)
- **Passos:** `/console/login` → dashboard.
- **Esperado:** MRR/métricas, lista de tenants, suspender/ativar, impersonar.
- **Aceite:** ✅ nenhum tenant acessa o Console; ✅ impersonação auditada.

### HM-19 · Plano e paywall
- **Passos:** expirar trial/plano e tentar escrever.
- **Esperado:** paywall bloqueia **escrita**, mantém **leitura**.
- **Aceite:** ✅ 402 → redireciona para `/plano`.

### HM-20 · LGPD
- **Passos:** exportar/anonimizar um cliente; exportar/encerrar a conta.
- **Esperado:** operações concluídas e refletidas.
- **Aceite:** ✅ páginas de Termos/Privacidade acessíveis; aceite registrado.

---

## Critérios de "pronto para piloto"

Considere o sistema **homologado para piloto assistido** quando:
- [ ] HM-01 a HM-08, HM-10 a HM-20 ✅ (WhatsApp em número de teste basta).
- [ ] HM-09 (e-mail real) ✅ — provider SMTP já existe; falta só criar a conta
      (Resend/Brevo) e apontar as envs.
- [ ] Backup do banco funcionando (idealmente off-site — D-19).

**Ainda NÃO exigido para o piloto** (fecha nas semanas seguintes, com clientes
dentro): template WhatsApp aprovado pela Meta (envio em massa fora da janela
24h), webhook InfinitePay validado com doc oficial (D-18), renovação automática
do SaaS (D-24) e a revisão **jurídica** de LGPD.

---

## Registro de execução

| Caso | Data | Resultado | Observação |
|---|---|---|---|
| HM-01 | | | |
| ... | | | |

> Dica: rode a suíte automatizada antes (`npm test`) para garantir que a lógica
> de domínio está verde, e só então faça a homologação manual dos fluxos acima.
</content>
