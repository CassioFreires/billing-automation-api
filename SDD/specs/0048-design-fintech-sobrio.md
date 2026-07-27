# Spec 0048 — Rebranding "Fintech Sóbrio" (Fase 1 do plano de produto)

- **Status**: Em implementação
- **Autor**: Cassio (com Claude)
- **Data**: 2026-07-27
- **Escopo**: **frontend** (`billing-automation-web`). Primeira fase do plano de
  produto (rebranding → white-label → módulos → SEO). Não muda backend/comportamento.

## 1. Problema / Motivação

O visual tinha "cara de template de IA": accent sky-blue genérico, **glow radial
colorido no fundo**, cards muito arredondados + sombra suave, paleta padrão. Queremos
identidade **fintech sóbria** própria — profissional, confiável — e, principalmente,
**tokenizar tudo** para destravar o white-label (cor por cliente, spec 0050).

## 2. Objetivo

Trocar a base visual via **tokens centralizados** (Tailwind v4 `@theme` em
`src/index.css`), sem tocar em comportamento:
- **Cor de marca:** verde-petróleo (`#14a08a`) — dinheiro + confiança, distinto do
  indigo/sky de template.
- **Neutros com viés verde-ink** (não navy/cinza puro).
- **Flat:** raio menor (`--radius-card` 1rem → 0.625rem), sombra discreta (sem glow
  colorido), **fundo sólido** (removido o gradiente radial).
- **Semânticas re-tonadas** e distintas da marca teal (success verde-grama, warning
  âmbar sóbrio, danger vermelho menos "candy").

## 3. Regras / Diretrizes

- **RN-4801** — Toda cor vem de **token** (`--color-*`). Componentes não usam hex/
  classes de cor hardcoded (ex.: `bg-sky-500`) — trocadas por `bg-brand-*`/semânticas.
  Pré-requisito do white-label (a cor de marca vira variável por tenant).
- **RN-4802** — Flat: menos raio, sombra mínima, sem gradientes decorativos de fundo.
  Gradientes só pontuais e **da marca** (ex.: texto do hero `brand-primary → brand-hover`).
- **RN-4803** — Sem regressão funcional: mudança é puramente visual (tokens + classes).

## 4. Mudanças

- `src/index.css` (`@theme`): paleta verde-petróleo + neutros ink + flat; removido o
  `background-image` radial do `body`.
- Cores hardcoded trocadas por tokens em: Clients, Subscriptions, Team, Portal,
  Dashboard, ImportWizard, ImportInvoicesWizard, Landing (gradientes de texto/CTA).

## 5. Camadas afetadas

- [x] Tokens — `src/index.css`.
- [x] Componentes/páginas — remoção de cores hardcoded (sky/indigo/gradiente).
- [x] Build limpo; sem mudança de API/comportamento.
- [ ] Follow-up: light theme (hoje dark-only), pareamento tipográfico (display), auditoria fina tela a tela (Fase 2 responsividade).

## 6. Critérios de aceite

- [x] Nenhuma cor sky/indigo/violet/purple hardcoded no app.
- [x] Fundo sólido (sem glow radial); cards flat (raio/sombra reduzidos).
- [x] Marca verde-petróleo aplicada via token; build limpo.

## 7. Notas

Mantido **dark-only** nesta fase (o app já era dark-only) — light theme é follow-up.
A cor de marca padrão (produto) será substituível **por tenant** no white-label
(spec 0050 / Fase 3). Plano completo: artefato "Plano de Produto & Rebranding".
