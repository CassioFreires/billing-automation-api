# SDD — Spec-Driven Development

Esta pasta é a **base de conhecimento e o motor de desenvolvimento orientado a especificação** do `billing-automation-api`.

O objetivo é simples: qualquer pessoa (ou agente de IA) que precise **entender**, **manter** ou **criar features** na aplicação deve começar por aqui. Em vez de reengenhariar o código toda vez, você lê o contexto, segue um playbook e escreve uma spec antes de codar.

## Como usar

1. **Entrar no projeto pela primeira vez?** Leia `context/` na ordem: `overview` → `architecture` → `domain-model` → `tech-stack` → `conventions`.
2. **Vai criar uma feature?** Copie `specs/_TEMPLATE.md` para `specs/NNNN-nome-da-feature.md`, preencha, e só então comece a implementar seguindo o playbook `skills/add-feature.md`.
3. **Vai corrigir/manter algo?** Consulte `context/tech-debt.md` (pode já estar mapeado) e o playbook relevante em `skills/`.
4. **Terminou algo?** Atualize o contexto afetado e mova o item resolvido em `tech-debt.md`.

## Estrutura

```
SDD/
├── README.md              ← você está aqui
├── context/               ← a "verdade" sobre a aplicação (o QUÊ e o PORQUÊ)
│   ├── overview.md         · propósito e capacidades do sistema
│   ├── architecture.md     · camadas, componentes e fluxo de dados
│   ├── domain-model.md     · entidades, estados e regras de negócio
│   ├── tech-stack.md       · tecnologias, versões e configuração
│   ├── conventions.md      · padrões de código e convenções do repo
│   ├── tech-debt.md        · problemas conhecidos e backlog de melhoria
│   └── production-readiness.md · roadmap para produção e comercialização (P0/P1/P2)
├── skills/                ← playbooks passo-a-passo (o COMO)
│   ├── add-feature.md      · criar uma feature end-to-end
│   ├── add-endpoint.md     · adicionar um endpoint REST
│   ├── add-worker-consumer.md · adicionar um consumidor de fila
│   ├── db-migration.md     · alterar o schema e migrar o banco
│   ├── run-and-debug.md    · rodar e depurar localmente
│   └── testing.md          · escrever e rodar testes (Vitest)
└── specs/                 ← especificações de features (uma por feature)
    └── _TEMPLATE.md        · modelo para novas specs
```

## Princípios

- **Contexto antes de código.** Se a informação não está aqui e você a descobriu, escreva-a aqui.
- **Spec antes de feature.** Feature sem spec vira dívida técnica silenciosa.
- **Documento vivo.** Estes arquivos refletem o estado atual — quando o código muda, o contexto muda junto (idealmente no mesmo commit/PR).
- **Fonte única de verdade.** Regras de negócio moram em `domain-model.md`, não espalhadas em comentários.
