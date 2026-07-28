# Spec 0049 — UX: Configurações em abas + Dashboard enxuto

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-27
- **Escopo**: **frontend** (`billing-automation-web`). Continuação da Fase 1 de design
  (spec 0048). Sem mudança de backend/comportamento.

## 1. Problema / Motivação

A tela de **Configurações** virou um scroll gigante com ~14 cards empilhados
("suja", muito scroll pra achar algo). O **Dashboard** estava grande/pesado
(margens e paddings largos, títulos grandes, cards muito arredondados). Feedback do
dono: "intuitiva, organizada, mínimo de scroll, mas com todos os detalhes".

## 2. Objetivo

- **Configurações → navegação por seções (abas):** uma nav lateral agrupa os cards
  por área; só a seção ativa aparece → mínimo scroll, organizado, intuitivo. Nada de
  detalhe é removido — só reorganizado.
- **Dashboard → navegação + densidade:** além de compactar (margens/paddings menores,
  títulos menores, cards flat, KPIs 2 col no mobile), o dashboard virou **por abas**
  (era muita coisa empilhada): **Visão geral** (KPIs + valor recuperado + atalho de
  recuperação) · **Lista do Dia** (F3) · **Previsão de caixa** (F4). Só uma seção
  pesada por vez.

## 3. Mudanças

- **Configurações** (`SettingsPage.tsx`): layout `grid [nav | conteúdo]`; estado
  `tab` + 6 seções:
  - **Cobrança:** Meio de pagamento · WhatsApp · Canal de envio · Régua.
  - **Recuperação:** Botão de Alívio · Retenção · Winback.
  - **Crescimento:** Loja no Pagamento · Indique e Ganhe.
  - **Acesso & Fiscal:** Controle de acesso · Conexão IoT · Nota Fiscal.
  - **Contrato** · **Privacidade (LGPD)**.
  Cada card existente foi mantido; só passou a renderizar condicionalmente por aba.
- **Dashboard** (`Dashboard.tsx`): `mt-12→mt-10`, `space-y-8→space-y-6`, título
  `text-3xl→text-2xl`, KPIs `p-6 rounded-2xl→p-4 rounded-xl` (grid 2 col no mobile),
  cards grandes `rounded-2xl p-6→rounded-xl p-5`; `rounded-2xl→rounded-xl` (flat).

## 4. Critérios de aceite

- [x] Configurações abre numa seção; trocar de aba mostra só aquela área (sem scroll gigante).
- [x] Todos os cards de config continuam acessíveis (nenhum detalhe perdido).
- [x] Dashboard mais compacto e flat; build limpo.

## 5. Notas

Nav responsiva: vira barra horizontal rolável no mobile, coluna fixa (sticky) no
desktop.

**Passe de consistência (mesmo PR):** a densidade/flatness foi aplicada também em
Clientes, Faturas, Assinaturas, Recuperações, Equipe e Plano — título
`text-3xl/extrabold → text-2xl/bold`, `mt-12 → mt-10`, `space-y-8 → space-y-6`,
`rounded-2xl → rounded-xl`. App inteiro com a mesma cara enxuta.
