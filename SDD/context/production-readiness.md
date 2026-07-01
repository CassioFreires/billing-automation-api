# Production Readiness & Roadmap Comercial

Estado alvo: transformar a API (base de engenharia saudável) num **SaaS multi-cliente, funcional, seguro e escalável**, pronto para comercializar.

Prioridades: **P0** bloqueia ter produto para vender · **P1** necessário para operar em produção · **P2** para escalar/crescer.

> Este documento é o roadmap de negócio/produção. Dívidas de código continuam em [`tech-debt.md`](./tech-debt.md); itens aqui que viram trabalho concreto ganham uma spec em [`../specs/`](../specs/).

---

## 🔴 P0 — Sem isso não há produto para vender

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-01 | **WhatsApp real** | `log-only` (D-02) — não envia | Plugar Meta Cloud API ou Twilio; templates aprovados; retry/tratamento de falha |
| PR-02 | **Gateway de pagamento real** | mock (`Math.random`) (D-15) | Integrar Asaas/Stripe/Mercado Pago; gerar PIX/cobrança real |
| PR-03 | **Idempotência do webhook** | reprocessa evento duplicado | Guardar `eventId` processado; ignorar repetição |
| PR-04 | **Multi-tenancy** | mono-tenant (dados num espaço único) | `Account` + `tenantId` em todas as tabelas + escopo obrigatório nos repositórios. **Ver spec `specs/0001-multi-tenancy.md`** |
| PR-05 | **Auth real / usuários** | conta de serviço única via env (D-16) | Modelo `User` (hash de senha, papéis), vínculo ao tenant, login/signup |
| PR-06 | **LGPD** | inexistente | Base legal, política de privacidade, termos, direito de exclusão, DPA. Processa CPF/telefone/dívida → obrigatório para vender |

## 🟠 P1 — Necessário para operar em produção

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-07 | **Logs estruturados** | `console.log` com emoji | Logger (pino) com níveis + correlação de request |
| PR-08 | **Monitoramento de erros/métricas** | nenhum | Sentry + métricas (DLQ crescendo = alarme de negócio) |
| PR-09 | **Graceful shutdown** | não fecha conexões no SIGTERM | Encerrar RabbitMQ/Prisma no shutdown (crítico em container/AWS) |
| PR-10 | **CI/CD + migrations** | `git pull` manual na AWS | Pipeline: `npm test` → build → `prisma migrate deploy` → deploy |
| PR-11 | **Rate limiting / anti-abuso** | nenhum | Limitar disparos de cobrança/WhatsApp (custo e abuso) |
| PR-12 | **Normalização de telefone** | livre | Padronizar E.164 antes de enviar |

## 🟡 P2 — Para escalar de verdade

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-13 | **Escala horizontal** | worker inline por default | `RUN_WORKER_INLINE=false` + escalar workers; API atrás de LB |
| PR-14 | **Pool de conexões Postgres** | Prisma direto | PgBouncer/pooler sob múltiplas réplicas |
| PR-15 | **Enum de status** | `String` livre (D-07) | Enum no Prisma + constantes centralizadas |
| PR-16 | **Billing do SaaS** | nenhum | Planos, limites/quotas, medição de uso, Stripe Billing |
| PR-17 | **Onboarding self-service** | nenhum | Signup, conectar WhatsApp/gateway, dashboard |
| PR-18 | **Documentação de API** | nenhuma | OpenAPI/Swagger para clientes/integradores |

---

## Caminho crítico até o 1º cliente pagante

1. **Multi-tenancy + User/Account** (PR-04, PR-05) — base estrutural, antes de dados reais.
2. **WhatsApp real** (PR-01).
3. **Gateway real + idempotência** (PR-02, PR-03).
4. **LGPD mínima** (PR-06).
5. **CI/CD + observabilidade + graceful shutdown** (PR-07..PR-10).
6. Depois: billing do SaaS, planos, onboarding (PR-16..PR-18).

Itens de escala fina (PR-14, PR-15) só quando o volume exigir — não bloqueiam os primeiros clientes.
