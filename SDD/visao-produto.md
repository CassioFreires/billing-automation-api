# Visão de Produto & Módulos — Adimplo

> **O que é este documento:** o "norte" do produto. Define o **posicionamento**,
> os **módulos** que compõem o Adimplo (o que é cada um, por que agrega valor e
> pra quem), o que **já existe**, a **estratégia** de cada um e a **ordem** de
> construir. Cada módulo, quando for implementado, ganha uma **spec** em
> [`specs/`](./specs/) e segue os playbooks de [`skills/`](./skills/).
>
> É um documento vivo e **didático** — explica os termos, porque o objetivo é
> também aprender o domínio (contas a receber / cobrança).

---

## 1. O posicionamento (a virada de chave)

**O Adimplo NÃO é "um app que dispara lembrete de cobrança".** Isso é commodity:
o próprio WhatsApp (lista de transmissão + mensagem agendada) faz, e todo gateway
brasileiro (Asaas, Cobre Fácil, InfinitePay) já manda lembrete.

> **Tese:** o Adimplo é o **piloto automático do Contas a Receber** de um pequeno
> negócio. O lembrete é *uma engrenagem* — o produto é **receber, conciliar,
> recuperar e enxergar o caixa**, sozinho.

**Quem paga e por quê:**
- **O dono (tenant)** — nosso cliente pagante — compra **visão e automação**:
  "recebo mais, atraso menos, não fico caçando quem pagou, e vejo meu caixa".
- **O devedor** — cliente do dono — ganha uma experiência **fácil de pagar**
  (link, PIX em 1 toque, negociação self-service). Boa experiência = paga mais.

O valor não está na mensagem; está **em volta do dinheiro**.

---

## 2. Conceitos essenciais (glossário do domínio)

- **Contas a Receber (AR):** tudo que o negócio tem pra receber (faturas em aberto).
- **Régua de cobrança (dunning):** a sequência de lembretes/ações ao longo do tempo
  (antes e depois do vencimento). Hoje o Adimplo faz disparo único; a régua é a
  versão com vários passos.
- **Conciliação:** casar o **dinheiro que entrou** com a **fatura** correspondente
  ("quem pagou o quê"). Pode ser **automática** (webhook do gateway) ou **manual**
  (dono registra um pagamento em dinheiro).
- **Baixa:** marcar uma fatura como paga.
- **Inadimplência:** faturas vencidas e não pagas.
- **Aging (envelhecimento):** faturas agrupadas por quanto tempo estão vencidas
  (0–30, 31–60, 60+ dias).
- **DSO (Days Sales Outstanding):** prazo médio, em dias, que você leva pra receber.
  Quanto menor, melhor o caixa.
- **Score de pagador:** nota de risco de um cliente pagar em dia, pelo histórico dele.
- **PIX / boleto / cartão:** meios de pagamento. **Boleto** é o "boletim bancário"
  com código de barras; gateways como InfinitePay/Asaas emitem.
- **Gateway:** provedor que gera a cobrança e processa o pagamento (InfinitePay, MP).
- **Webhook:** o gateway "liga de volta" pra API avisando que foi pago → base da
  conciliação automática.
- **NFS-e (Nota Fiscal de Serviço eletrônica):** documento fiscal obrigatório para
  prestadores de serviço, emitido na **prefeitura** (cada município tem seu sistema).
- **Autonegociação / acordo:** o devedor escolhe sozinho como quitar (à vista com
  desconto, ou parcelado), sem o dono negociar manualmente.
- **Previsão de caixa:** estimativa de quanto e quando vai entrar dinheiro.

---

## 3. Mapa de módulos

Cada módulo tem: **o que é · por que agrega (e pra quem) · o que já temos ·
estratégia · dependências · esforço**.

### Fase 0 — Base (JÁ EXISTE) ✅
Cobrança avulsa e recorrente, gateway (PIX/cartão via InfinitePay), **webhook que
concilia e dá baixa automática**, multi-tenant, pagamento/WhatsApp por tenant.
> Isto já é *metade das peças difíceis*. Os módulos abaixo empacotam isso como
> produto.

---

### M1 — Recebimentos (dinheiro por qualquer meio) 🧩 *base dos demais*
- **O que é:** um lugar único onde **todo** pagamento entra — automático (gateway)
  **e manual** (dinheiro, transferência, maquininha, boleto pago no banco). Cada
  fatura pode receber **baixa manual** com meio + data + comprovante anexado.
- **Por que agrega (dono):** sem isso, a conciliação **mente** — muita gente paga
  fora do gateway. Registrar tudo é o que torna "quem pagou" verdadeiro. É
  pré-requisito do Cockpit (M5).
- **O que já temos:** baixa automática (webhook) + status da fatura + máquina de
  estados (`canTransitionInvoice`).
- **Estratégia:** adicionar `Payment` (registro de pagamento) ligado à `Invoice`
  — origem (`gateway`/`manual`), meio (`pix`/`dinheiro`/`transferencia`/`cartao`/
  `boleto`), valor, data, comprovante (URL). Baixa manual = criar `Payment` manual
  + transição de status. Boleto = habilitar no gateway.
- **Dependências:** nenhuma nova crítica (comprovante pede storage de arquivo —
  pode ser o mesmo S3 do backup).
- **Esforço:** médio. **✅ Backend implementado** (spec 0015: `Payment`, baixa manual, webhook unificado). Falta o **frontend** (botão "dar baixa" + lista de recebimentos).

### M2 — Recuperação inteligente 💸
- **O que é:** a régua (vários lembretes: antes/no dia/depois) **+ autonegociação**
  — o devedor abre o link e escolhe *pagar à vista com desconto* ou *parcelar*.
- **Por que agrega (dono + devedor):** recupera inadimplência **sem o dono
  negociar no zap**; o devedor resolve sozinho. Nenhum "disparador" faz isso.
- **O que já temos:** disparo único + fila/worker + link de pagamento.
- **Estratégia:** `ReminderRule` (passos da régua: offset em dias + mensagem) por
  fatura/tenant; o scheduler diário decide qual passo disparar (idempotente: não
  repete o mesmo passo). Autonegociação = página de acordo que gera nova cobrança
  (com desconto/parcelas) via gateway.
- **Dependências:** M1 (saber o que já foi pago) ajuda a parar a régua na hora.
- **Esforço:** médio-alto (a autonegociação é o pedaço maior).

### M3 — Fiscal / NFS-e automática 🧾 *(matador se o nicho for serviço)*
- **O que é:** ao receber, **emite a nota fiscal de serviço sozinho**.
- **Por que agrega (dono):** prestador de serviço é **obrigado** a emitir NFS-e e
  odeia o site da prefeitura. Se o Adimplo resolve automático, ele não larga.
- **O que já temos:** o gatilho ("foi pago") via webhook.
- **Estratégia:** integrar um **provider de NFS-e** que abstrai as prefeituras —
  **PlugNotas, Focus NFe, eNotas ou NFe.io** (nunca integrar prefeitura na mão).
  Ao marcar `PAID`, chamar o provider com os dados do serviço/cliente.
- **Dependências:** provider externo (custo por nota) + dados fiscais do tenant
  (CNPJ, regime, código de serviço). Integração pesada.
- **Esforço:** alto. **Só vale com foco em nicho de serviço.**

### M4 — Cockpit do dono (inteligência de recebíveis) 📊 *(o "uau" do dono)*
- **O que é:** não é "lista de faturas" — é o **raio-x do negócio**: previsão de
  quanto/quando vai entrar, % de inadimplência, aging, DSO, **risco por cliente**
  e **ações sugeridas** ("cobre esses 5 hoje", "R$ X vencem essa semana").
- **Por que agrega (dono):** vira **decisão financeira**, não notificação. É o que
  faz o dono **abrir todo dia** e justifica a assinatura mensal. Fica mais
  inteligente quanto mais dado acumula.
- **O que já temos:** os dados (faturas, pagamentos, datas). Falta agregá-los.
- **Estratégia:** endpoints de agregação (somas por período/status, aging, DSO) +
  um score simples por histórico de atraso do cliente. Começar com métricas e uma
  "fila de ações do dia"; evoluir pra previsão baseada em padrão de pagamento.
- **Dependências:** M1 (conciliação completa = números confiáveis).
- **Esforço:** médio (começa simples, cresce).

### M5 — Adimplência premiada 🎁 *(identidade da marca)*
- **O que é:** recompensa **quem paga em dia** — desconto à vista automático,
  cashback, selo de bom pagador.
- **Por que agrega:** inverte o jogo — **cobra sem azedar a relação**. Casa com o
  nome "Adimplo" (estar em dia). Diferencial de marca difícil de copiar.
- **Estratégia:** regra de desconto por antecipação/pontualidade aplicada na
  geração da cobrança; histórico de pontualidade vira "selo"/benefício.
- **Dependências:** M1 (pra saber quem pagou em dia).
- **Esforço:** médio.

### Módulos de apoio (quando fizer sentido)
- **Portal do devedor:** página (sem login) onde o cliente vê tudo que deve e paga.
- **Webhooks de saída:** avisa o ERP/sistema do dono quando uma fatura é paga.
- **Planos/billing do SaaS:** o Adimplo cobrando seus próprios clientes (o Adimplo
  usando o Adimplo) — limites por plano, medição de uso.
- **Multicanal:** e-mail/SMS além do WhatsApp (fallback).

---

## 4. Ordem recomendada (faseamento)

Cada fase entrega valor sozinha e prepara a próxima.

1. **M1 — Recebimentos (baixa manual + meios).** Destrava a **conciliação real**
   (base de tudo). *Próximo passo.*
2. **M4 — Cockpit do dono.** O "uau" que vende e retém; usa os dados já existentes.
3. **M2 — Recuperação inteligente.** Régua adaptativa + autonegociação.
4. **M3 — NFS-e.** *Se* escolher nicho de serviço → vira o maior diferencial.
5. **M5 — Adimplência premiada** e módulos de apoio.

> **Decisão de produto em aberto:** **nicho vs genérico.** Mirar um nicho de
> serviço recorrente (academia, clínica, escola, prestador) torna o M3 (NFS-e) um
> matador e permite resolver a dor *inteira* de um público — atalho pro "uau".
> Genérico atende qualquer PME que cobra, mas dilui o diferencial.

---

## 5. Como um módulo vira código (o processo)

Para cada módulo/feature, seguir o fluxo do SDD:
1. **Spec:** copiar `specs/_TEMPLATE.md` → `specs/NNNN-nome.md`, definir escopo,
   modelo de dados, regras e casos de uso.
2. **Schema + migration** (ver `skills/db-migration.md`).
3. **Camadas:** repository → service → controller → router (ver `skills/add-*`).
4. **Testes** (Vitest) + **atualizar o contexto** em `context/`.
5. **Deploy** (`scripts/deploy.sh`) e, no front, `deploy-web.sh`.

> Regra de ouro: **uma feature por spec, uma mudança por PR**, com teste antes de
> commitar (foi assim que fechamos o checklist de melhorias).

---

## 6. Relação com os outros documentos
- **O que existe hoje / como funciona:** [`context/`](./context/) (`overview`,
  `domain-model`, `architecture`, `fluxo-completo`, `devops-infra`).
- **Melhorias técnicas / dívidas:** [`checklist-melhorias.md`](./checklist-melhorias.md),
  [`context/tech-debt.md`](./context/tech-debt.md).
- **Prontidão comercial:** [`context/production-readiness.md`](./context/production-readiness.md).
- **Este doc** = *para onde o produto vai* (o QUÊ e o PORQUÊ dos próximos módulos).
