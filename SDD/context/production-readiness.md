# Production Readiness & Roadmap Comercial

Estado alvo: transformar a API (base de engenharia saudável) num **SaaS multi-cliente, funcional, seguro e escalável**, pronto para comercializar.

Prioridades: **P0** bloqueia ter produto para vender · **P1** necessário para operar em produção · **P2** para escalar/crescer.

> Este documento é o roadmap de negócio/produção. Dívidas de código continuam em [`tech-debt.md`](./tech-debt.md); itens aqui que viram trabalho concreto ganham uma spec em [`../specs/`](../specs/).

---

## 🔴 P0 — Sem isso não há produto para vender

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-01 | **WhatsApp real** | 🟡 Parcial (2026-07) | ✅ Provider Meta Cloud API envia texto, **configurável por tenant** (`WhatsappSetting`, spec 0014); worker re-tenta em falha (nack→DLQ); testado. Falta: **template aprovado** (fora da janela 24h), webhook de status, **verificação Meta** e **cifrar token no banco** (D-17) |
| PR-02 | **Gateway de pagamento real** | 🟡 Parcial (2026-07) | ✅ Seam multi-provider **por tenant** (`PaymentSetting`, spec 0012): **InfinitePay** (default), Mercado Pago (Checkout Pro) e `mock`. Falta: **conta real + teste ponta-a-ponta** e **fechar o webhook do InfinitePay** com a doc oficial (D-18, spec 0011) |
| PR-19 | **Cobrança recorrente + import** | ✅ Implementado (2026-07) | Assinaturas mensais idempotentes (spec 0009) + import de clientes CSV (spec 0008) + agendador cross-tenant por cron (specs 0010/0013) |
| PR-03 | **Idempotência do webhook** | ✅ Implementado (2026-07-01) | `WebhookEvent.recordIfNew` dedup por `eventId`. Falta: hardening transacional |
| PR-04 | **Multi-tenancy** | ✅ Implementado (2026-07-01) | `Account` + `tenantId` em Client/Invoice, escopo via `tenant-context` + repositórios, tenant no JWT/fila. **Spec `specs/0001-multi-tenancy.md`**. Falta: validar escopo em banco real; migrar clientes reais para tenants próprios (hoje tudo no tenant default) |
| PR-05 | **Auth real / usuários** | ✅ Implementado (2026-07-01) | Modelo `User` + signup/login por e-mail (bcrypt), vínculo ao tenant. Spec `specs/0002`. Falta: verificação de e-mail, reset de senha, convites/multiusuário, RBAC |
| PR-06 | **LGPD** | 🟡 Parcial (2026-07-01) | ✅ Código: direitos do titular (`/api/lgpd` — export/portabilidade + anonimização, spec 0004). ⏳ Falta a parte **jurídica/documental**: base legal, política de privacidade, termos, DPA, DPO (ver spec 0004 §11 — precisa de revisão jurídica) |

## 🟠 P1 — Necessário para operar em produção

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-07 | **Logs estruturados** | `console.log` com emoji | Logger (pino) com níveis + correlação de request |
| PR-08 | **Monitoramento de erros/métricas** | nenhum | Sentry + métricas (DLQ crescendo = alarme de negócio) |
| PR-09 | **Graceful shutdown** | ✅ Implementado (2026-07-01) | `server.ts`/`worker.ts` tratam SIGTERM/SIGINT (fecham HTTP→RabbitMQ→Redis→Prisma). Dockerfile usa `tini`; compose com `stop_grace_period` |
| PR-10 | **CI/CD + migrations** | 🟡 Parcial (2026-07) | ✅ Deploy **automatizado por script** (`scripts/deploy.sh`: pull→build→migrate→recria→health→rollback; `deploy-web.sh` p/ o front). Stack free-tier com Caddy/HTTPS. Falta o **pipeline** de verdade (GitHub Actions: test→build→deploy sozinho). Ver `devops-infra.md` §7 |
| PR-20 | **Hospedagem + HTTPS + backup** | ✅ Implementado (2026-07-03/04) | App no ar em `https://useadimplo.com.br` (Caddy/Let's Encrypt); backup diário do Postgres com rotação; hardening de portas + rotação de segredos. **Falta: backup off-site (S3)** (D-19). Ver `devops-infra.md` |
| PR-11 | **Rate limiting / anti-abuso** | nenhum | Limitar disparos de cobrança/WhatsApp (custo e abuso) |
| PR-12 | **Normalização de telefone** | livre | Padronizar E.164 antes de enviar |

## 🟡 P2 — Para escalar de verdade

| # | Item | Situação atual | O que fazer |
|---|---|---|---|
| PR-13 | **Escala horizontal** | 🟡 Parcial | ✅ Em produção o worker já roda **isolado** (`RUN_WORKER_INLINE=false`, container próprio). Falta: escalar N workers e API atrás de LB quando o volume exigir |
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
