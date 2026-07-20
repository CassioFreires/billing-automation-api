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

### 1.1 O coração (o moat que ninguém copia)

Os diferenciais vistosos — autonegociação, score de reputação, régua que aprende,
omnichannel por taxa de abertura — **não são features independentes**. São todos
*aplicações* de **um único ativo**: o **grafo de comportamento + pagamento de cada
pagador**, com o Adimplo sendo **dono da camada de interação** (o link, os eventos,
a identidade do pagador).

> **Tese do coração:** o Adimplo é dono do **Elo** — o link próprio (página viva),
> o registro de cada interação (abertura, clique, tentativa de pagar, entrega por
> canal) e a **identidade do pagador**. WhatsApp e Instagram **nunca** constroem
> esse grafo, porque o dinheiro e o pós-venda não moram lá. Esse é o fosso — e ele
> **melhora sozinho quanto mais clientes o Adimplo tem** (efeito de rede).

**Posicionamento afiado:** o Adimplo é a plataforma de **Gestão Reputacional de
Crédito e Cobrança Humanizada** para PMEs — *"não enviamos cobranças; blindamos o
fluxo de caixa do dono sem queimar a relação com o cliente"*.

**Decisões de produto (2026-07-20):**
- **Nicho primeiro, genérico depois.** Fincar bandeira num **serviço recorrente**
  (academia, clínica, escola, prestador): torna NFS-e (M3) e **PIX Automático**
  matadores e resolve a dor *inteira* de um público. Abrir pro genérico só depois do
  coração provado.
- **Rosto do produto = Autonegociação sem atrito (M2).** É o "uau" da demo. Implica
  que **fechar o gateway real ponta-a-ponta (D-18) é pré-requisito de fundação**,
  não dívida — a "página que renegocia sozinha" precisa de um gateway que crie
  cobranças novas de verdade.

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
- **Elo (link próprio):** o link de cobrança **hospedado pelo Adimplo** (domínio
  próprio, não o do gateway) — uma *página viva* que abre o pagamento e registra o
  comportamento do pagador.
- **Evento de interação:** cada ação medível no Elo — link aberto, clicado,
  tentativa de pagar, e status de entrega por canal (enviado/entregue/lido/falhou).
- **Identidade do pagador (`Payer`):** a mesma pessoa (por CPF/telefone) amarrada
  entre faturas e — no futuro — entre tenants. Base do score de reputação.
- **Score Adimplo (reputação):** nota de crédito construída a partir do comportamento
  **real de pagamento dentro da rede** — um "positivo" próprio, defensável por efeito
  de rede.
- **PIX Automático:** débito recorrente autorizado uma vez pelo pagador (padrão do BC)
  — mata a fricção mensal das assinaturas.

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

### Fundação — "Elo": link próprio + eventos + identidade do pagador 🔑 *(o coração)*
- **O que é:** o Adimplo passa a ser **dono do link de cobrança** (hoje o
  `checkoutUrl` é do gateway) — uma **página viva** em domínio próprio — e registra
  cada **interação** (`InteractionEvent`: aberto, clicou, tentou pagar, entregue/lido
  por canal). Introduz a **identidade do pagador** (`Payer`, por CPF/telefone) que
  amarra o histórico entre faturas.
- **Por que agrega:** é a **substância** de TODOS os diferenciais — sem ela a
  autonegociação (M2) não detecta dúvida, o omnichannel não escolhe canal por taxa de
  abertura e o score (M5) não tem dado. É o moat.
- **O que já temos:** `Payment` (M1) como base do histórico financeiro; seam de
  gateway; seam de WhatsApp.
- **Estratégia:** ver spec **0016**. Link curto próprio → hospeda/redireciona o
  pagamento; um middleware registra eventos; `Payer` (identidade) + `InteractionEvent`.
  Fecha **D-18** (gateway E2E) e **D-02** (webhook de status de entrega) como parte da
  fundação — omnichannel e autonegociação dependem deles.
- **Dependências:** M1 (feito). Gateway real testado (D-18) entra aqui.
- **Esforço:** médio-alto. **É o próximo passo.**

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
- **Esforço:** médio. **✅ Entregue (backend + frontend)** — spec 0015: `Payment`, baixa manual, webhook unificado; UI com botão "Dar baixa" e lista de recebimentos na página de faturas.

### M2 — Recuperação inteligente 💸 ⭐ *(o ROSTO do produto)*
- **O que é:** a régua (vários lembretes: antes/no dia/depois) **+ autonegociação
  sem atrito** — o devedor abre o Elo e escolhe *pagar à vista com desconto*,
  *parcelar no cartão* ou *adiar o vencimento* (com taxa que o dono define antes).
- **Gatilho comportamental (o "uau"):** o Elo **detecta dúvida** — se o pagador abre
  o link N vezes e não paga, o sistema ativa o **Botão de Alívio de Caixa**
  automaticamente ("essa semana está apertada? quebra em 3x ou adia 7 dias por R$ X").
  Zero constrangimento humano — o dono definiu as regras, o Adimplo executa sozinho.
- **Por que agrega (dono + devedor):** recupera inadimplência **sem o dono negociar
  no zap**; o devedor resolve sozinho. Nenhum "disparador" faz isso.
- **O que já temos:** disparo único + fila/worker + link. Falta o Elo (eventos) e o
  gateway criando cobranças novas de verdade.
- **Estratégia:** `ReminderRule` (passos da régua: offset em dias + mensagem) por
  fatura/tenant; o scheduler diário decide qual passo disparar (idempotente). A
  autonegociação é uma página de acordo que gera **nova cobrança** (desconto/parcelas/
  novo vencimento) via gateway; o Botão de Alívio dispara por regra sobre os eventos
  do Elo (ex.: `open >= 3 AND pay_attempt = 0`).
- **Dependências:** **Fundação Elo** (eventos + gateway real E2E, D-18) — hard
  requirement. M1 ajuda a parar a régua na hora certa.
- **Esforço:** alto (é o rosto — vale o investimento). Fasear: régua → autonegociação
  → gatilho comportamental.

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
- **Loop que aprende (M4 → M2):** a previsão do Cockpit ("esse cliente atrasa 4
  dias") **retroalimenta** o agendamento da régua ("dispara 2 dias antes pra ele").
  Régua auto-ajustável = a história de IA que fica melhor com dados acumulados.
- **Dependências:** M1 (conciliação completa = números confiáveis) + eventos do Elo.
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
- **Portal do devedor ("Meu Perfil Adimplo"):** página (sem login) onde o pagador vê
  tudo que deve, paga, e acompanha seu **selo/score** de bom pagador. Vira vitrine do
  M5.
- **Score Adimplo cross-tenant (o moat de dados):** reputação de crédito que **viaja**
  entre tenants (mesmo pagador por CPF/telefone) — efeito de rede difícil de copiar.
  ⚠️ Exige **base legal LGPD** (consentimento, spec 0004) desenhada **antes** do código.
- **Omnichannel real (multicanal com fallback):** e-mail/SMS além do WhatsApp; o
  sistema **muda de canal** conforme a taxa de abertura/entrega (do Elo). Depende do
  **webhook de status** (D-02).
- **PIX Automático:** débito recorrente autorizado — mata a fricção mensal das
  assinaturas (spec 0009). Diferencial forte no nicho de serviço recorrente.
- **API pública + webhooks de saída + widget embutível:** API-key por tenant,
  OpenAPI/Swagger (PR-18), webhooks de saída ("fatura paga" → ERP do dono) e botão
  "Pague aqui" embutível em sites de terceiros. Adimplo vira **infraestrutura** que
  outros sistemas compõem, não só um app.
- **Planos/billing do SaaS:** o Adimplo cobrando seus próprios clientes (o Adimplo
  usando o Adimplo) — limites por plano, medição de uso.

---

## 4. Ordem recomendada (faseamento) — atualizada 2026-07-20

Cada fase entrega valor sozinha e prepara a próxima. M1 (Recebimentos) já está
**entregue** (spec 0015).

1. **Fundação "Elo"** (spec **0016**) — link próprio + `InteractionEvent` +
   identidade do pagador; fecha **gateway E2E (D-18)** e **webhook de status (D-02)**.
   *Destrava todos os diferenciais.* **Próximo passo.**
2. **M4 — Cockpit do dono.** Barato, usa dados já existentes + os novos eventos; é o
   que **retém** (o dono abre todo dia).
3. **M2 — Recuperação inteligente / Autonegociação.** O **rosto** do produto — só
   possível depois do Elo + gateway real. Fasear: régua → autonegociação → gatilho
   comportamental (Botão de Alívio).
4. **M3 — NFS-e.** No **nicho de serviço recorrente** (decisão tomada), vira o maior
   diferencial. **PIX Automático** entra junto do nicho.
5. **M5 — Adimplência premiada + Score de reputação** (o moat de dados) e módulos de
   apoio (portal do devedor, API pública, omnichannel).

> **Decisão de produto (2026-07-20): nicho primeiro, genérico depois.** Fincar
> bandeira num **serviço recorrente** (academia, clínica, escola, prestador) torna
> M3 (NFS-e) e PIX Automático matadores e resolve a dor *inteira* de um público —
> atalho pro "uau". Abre-se pro genérico depois do coração provado.

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
