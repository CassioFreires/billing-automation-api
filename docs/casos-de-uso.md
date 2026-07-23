# Casos de Uso — Como o cliente usa o Adimplo

> Jornadas reais de uso, do primeiro acesso ao dinheiro na conta. Público:
> produto, vendas, suporte e homologação. Dois personagens:
> **o Dono** (nosso cliente pagante, dono de um negócio) e **o Pagador**
> (cliente do Dono, quem deve).

---

## Personagens

- **Dono (tenant):** dona de clínica, academia, escola ou prestador de serviço.
  Quer *receber mais, atrasar menos e enxergar o caixa* sem caçar quem pagou.
- **Pagador:** cliente do Dono. Quer uma forma **fácil de pagar** (link, PIX em
  1 toque, negociar sozinho).
- **Você (plataforma):** dono do SaaS. Opera o **Console** (`/console`), separado
  do app dos clientes.

---

## UC-01 — Cadastro e primeiro acesso (onboarding guiado)

**Objetivo:** sair do zero à 1ª cobrança sem travar.

1. O Dono acessa `useadimplo.com.br` → **Criar conta** (`/register`): nome da
   empresa, nome, e-mail, senha + aceite dos Termos/Privacidade (LGPD).
2. Cai no **Dashboard** com um **checklist de ativação** no topo:
   - [ ] Configurar recebimento (gateway de pagamento)
   - [ ] Conectar o WhatsApp (opcional)
   - [ ] Cadastrar o 1º cliente
   - [ ] Emitir a 1ª cobrança
3. O progresso é **derivado de dados reais** e some sozinho ao concluir.

**Resultado:** o Dono chega ao "aha" (1ª cobrança) dentro do trial de 14 dias.

---

## UC-02 — Configurar como recebe (gateway por tenant)

1. Configurações → **Recebimento**.
2. Escolhe entre 8 provedores (InfinitePay, Mercado Pago, Asaas, PagBank, Efí,
   Stripe, Pagar.me, mock) e informa as credenciais **dele**.
3. Credenciais são **cifradas em repouso**; a API nunca as devolve.

**Regra:** cada Dono recebe na *própria* conta do gateway. Remove a objeção de
venda "funciona com o que eu já uso?".

---

## UC-03 — Escolher o canal de cobrança

1. Configurações → **Canal de envio**: `WhatsApp` | `E-mail` | `Ambos`.
2. (WhatsApp) conecta o número próprio (Meta Cloud API) — token mascarado.
3. **Fallback:** se escolher e-mail mas o cliente não tiver e-mail, cai para
   WhatsApp — nunca deixa de cobrar.

---

## UC-04 — Cadastrar clientes (avulso ou em lote)

- **Avulso:** Clientes → Novo (`nome`, `telefone`, `documento`, `e-mail?`).
- **Em lote (CSV):** assistente de importação mapeia colunas, valida e faz
  upsert por telefone. Ideal para quem chega com uma carteira pronta.

---

## UC-05 — Emitir cobrança

- **Avulsa:** Faturas → Nova (valor, vencimento, itens). Nasce `PENDING` e já
  ganha `gatewayId` + PIX/checkout do gateway do tenant.
- **Recorrente (assinatura):** cria um molde mensal; o agendador gera a fatura
  de cada competência sozinho (idempotente — nunca duplica).
- **Em lote (CSV de faturas):** assistente cria várias faturas, resolvendo o
  cliente pelo telefone.

---

## UC-06 — Cobrança automática (o piloto automático)

1. Todo dia às 11:00 o **cron** dispara o ciclo (gera recorrentes + enfileira
   vencidos), sem ninguém clicar.
2. A **régua multipasso** decide qual lembrete cada fatura recebe (ex.: 3 dias
   antes, no dia, 3 e 7 dias depois), uma vez cada.
3. O **worker** envia pelo canal configurado e registra o envio.

**Resultado:** cobrança vira processo, não tarefa manual.

---

## UC-07 — O pagador recebe e paga (Elo)

1. O Pagador recebe a mensagem com um **link do Adimplo** (`/r/:token`) — não do
   gateway.
2. Ao abrir, o sistema **registra o evento** (`open`) e redireciona ao pagamento.
3. Paga por PIX/cartão. O gateway chama o **webhook** → a fatura vira `PAID`
   automaticamente (conciliação).

**Por que o link é próprio:** captura o **comportamento** do pagador (abriu,
clicou, tentou pagar) — a matéria-prima da autonegociação, do Cockpit e do score.

---

## UC-08 — Autonegociação sem atrito (o "uau" — Botão de Alívio)

1. O Dono define **antes** as regras (desconto à vista, parcelar, adiar + taxa).
2. O Elo **detecta dúvida**: se o Pagador abre o link N vezes e não paga, o
   sistema ativa sozinho o **Botão de Alívio** ("essa semana está apertada?
   quebra em 3x ou adia 7 dias por R$ X").
3. O Pagador escolhe; o sistema gera uma **nova cobrança** (acordo) via gateway.

**Resultado:** recupera inadimplência **sem o Dono negociar no zap** e **sem
constranger** o Pagador.

---

## UC-09 — Portal do pagador (transparência)

1. O Dono copia o link do portal (`/portal/:token`) e envia ao Pagador.
2. O Pagador vê **todas** as cobranças dele (em aberto com botão Pagar +
   histórico), sem login. Respeita LGPD.

---

## UC-10 — Baixa manual (dinheiro fora do gateway)

1. Pagou em dinheiro/transferência/maquininha? O Dono clica **"Dar baixa"** na
   fatura, informa meio + data (+ comprovante por URL).
2. A fatura vira `PAID`. Sem isso, a conciliação "mente".

---

## UC-11 — Cockpit (o raio-x do caixa)

O Dono abre o **Dashboard** e vê:
- KPIs: **a receber**, a vencer, **em atraso**, recebido.
- **Aging** (0-30 / 31-60 / 60+ dias) e contagem por status.
- **Valor recuperado** (quanto de atraso virou caixa) — a prova de ROI.
- **Fila de ações do dia**: "vence essa semana" + "está hesitando" (do Elo).

**Resultado:** vira decisão financeira, não notificação — o que faz o Dono
abrir todo dia.

---

## UC-12 — Equipe e papéis

O Dono convida a equipe e define o papel: **Dono**, **Administrador** (gerencia
equipe/config) ou **Membro** (opera o dia a dia). Autorização por papel; a aba
"Equipe" só aparece para quem gerencia.

---

## UC-13 — LGPD (direitos do titular)

- Páginas públicas de Política de Privacidade e Termos.
- **Aceite no cadastro** com prova (data + versão).
- Configurações → Privacidade: exportar/anonimizar um cliente; exportar/encerrar
  a própria conta.

---

## UC-14 — Plano e assinatura do SaaS

1. O Dono vê o plano em `/plano` (Free / Essencial / Pro, trial de 14 dias no Pro).
2. Ao expirar o trial/plano, um **paywall** bloqueia escrita (leitura continua) e
   oferece upgrade.

---

## UC-15 — Console da plataforma (você)

Em `/console` (identidade e login próprios, `scope:platform`, isolado dos
clientes) você vê **MRR + métricas**, lista/gerencia tenants, suspende/reativa,
muda plano e **impersona** um tenant (com auditoria). Nenhum cliente vê ou acessa
o Console.

---

## Mapa: jornada → telas

| Jornada | Telas |
|---|---|
| Onboarding | `/register` → `/dashboard` (checklist) |
| Configurar | `/settings` (recebimento, canal, WhatsApp, régua, autonegociação, privacidade) |
| Operar | `/clients`, `/invoices`, `/subscriptions` |
| Enxergar | `/dashboard` (Cockpit), `/plano` |
| Pagador | `/r/:token`, `/pagar/:token`, `/portal/:token` |
| Você | `/console` |
</content>
