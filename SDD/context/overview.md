# Overview — billing-automation-api

> Marca comercial do produto: **Adimplo** (o repositório mantém o nome técnico
> `billing-automation-api`). Em produção: `https://useadimplo.com.br`
> (ver [`devops-infra.md`](./devops-infra.md)).

## O que é

API de **automação de cobrança** multi-tenant (SaaS). O sistema gerencia clientes,
**assinaturas recorrentes** e faturas (invoices), **gera as cobranças
automaticamente** (cron diário) e dispara **notificações via WhatsApp** de forma
assíncrona para clientes inadimplentes, gerando dados de pagamento (PIX / gateway)
no processo. Pagamento e WhatsApp são **configuráveis por tenant** (cada cliente
recebe/envia na própria conta).

## Capacidades atuais

| Capacidade | Descrição | Estado |
|---|---|---|
| Autenticação | Login de conta de serviço (`/api/auth/login`) emitindo JWT; rotas internas protegidas por Bearer, webhook por segredo | ✅ Funcional (conta única via env — ver D-16) |
| CRUD de Clientes | Criar, listar, buscar, atualizar e remover clientes | ✅ Funcional |
| Importação de clientes (CSV) | Upsert em massa por telefone (`POST /api/clients/import`, spec 0008) | ✅ Funcional |
| Assinaturas recorrentes | Molde mensal que gera faturas por competência, idempotente (spec 0009) | ✅ Funcional |
| Criação de Faturas | Gerar cobrança via gateway (`infinitepay` default; `mercadopago`; `mock`) | ✅ Funcional (seam por tenant) |
| Pagamento por tenant | Cada tenant recebe na própria conta (`PaymentSetting`, spec 0012) | ✅ Funcional |
| Webhook de Pagamento | Receber confirmação e atualizar status, de forma **idempotente** | ✅ Funcional (verificação por provider) |
| Listagem de inadimplentes | Listar faturas pendentes de clientes `EM_ATRASO`, com paginação e cache | ✅ Funcional |
| Enfileiramento de notificações | Enfileirar faturas em atraso para processamento assíncrono | ✅ Funcional |
| Agendador cross-tenant | Cron chama `/api/system/billing/run` e `/api/system/notifications/run` (auth `x-cron-secret`) → fan-out por tenant (specs 0010/0013) | ✅ Funcional |
| WhatsApp por tenant | Config de envio por tenant (`WhatsappSetting`, spec 0014), token mascarado | ✅ Funcional (config) |
| Envio de WhatsApp | Worker consome a fila e "envia" a mensagem de cobrança | ⚠️ **Default log-only** — seam pronto p/ Meta Cloud API por tenant; envio real desligado até verificação Meta (D-02) |
| Cache de leitura | Cache Redis (opcional) para faturas pendentes | ✅ Funcional com fallback |
| Link próprio + eventos ("Elo") | Link do Adimplo (`/r/:token`) que registra abertura e redireciona; eventos de interação (`link_created`/`sent`/`open`/`paid`) como fonte única do comportamento — base de M2/M4/M5 (spec 0016) | ✅ Funcional (backend) — `delivered`/`read` dependem do webhook de status (D-02) |

## Fluxo de negócio (visão macro)

```
1. Cadastra-se o cliente ............... POST /api/clients
2. Gera-se a fatura .................... POST /api/invoices        (cria PIX/gateway mock)
3. Cliente atrasa ...................... (status vira EM_ATRASO / OVERDUE)
4. Dispara-se a cobrança ............... POST /api/notifications/trigger-overdue[/:invoiceId]
     └── enfileira em RabbitMQ (invoice_processing_queue)
5. Worker processa ..................... consome a fila (no contexto do tenant)
     ├── busca a fatura real (findNotificationDataById)
     ├── marca notificationSent = true
     └── envia WhatsApp (seam log-only) com checkoutUrl/PIX reais
6. Cliente paga ........................ gateway chama POST /api/invoices/webhook
     └── webhook idempotente atualiza o status (ex.: PAID)
```

## Público / integrações externas

- **Front-end (Adimplo web)**: painel React; chama a API no mesmo domínio (`/api`).
- **Cron do Linux (na VM)**: dispara o ciclo diário chamando os endpoints de sistema (`/api/system/*`) com `x-cron-secret`. Substituiu o n8n (leve demais p/ o free tier). Ver [`devops-infra.md`](./devops-infra.md).
- **Gateway de pagamento** (InfinitePay default; Mercado Pago): gera a cobrança e chama `POST /api/invoices/webhook` para confirmar pagamentos.
- **WhatsApp (Meta Cloud API)**: destino das notificações — seam pronto, envio real desligado até a verificação Meta.

## O que este sistema **não** faz (ainda)

- **Não envia WhatsApp de verdade por default** — o seam está pronto (e é por tenant), mas o provider padrão é `log-only` até a verificação da Meta sair (D-02).
- **Teste real de pagamento pendente** — InfinitePay é o default, mas falta uma conta real para o teste ponta-a-ponta; o webhook do InfinitePay ainda precisa ser fechado com a doc oficial (spec 0011).
- **Segredos por tenant (tokens) em texto no banco** — precisam ser cifrados antes de produção multi-tenant real.
- **Backup off-site (S3)** — hoje o backup é só no disco da VM (ver `devops-infra.md`).
- Não há LGPD completa (base legal, política, termos) — pré-requisito para comercializar (PR-06).
- Multiusuário por conta, verificação de e-mail, reset de senha e RBAC ainda não existem (spec 0002).
- Sem observabilidade/CI-CD de produção ainda (ver `production-readiness.md`).

> Para o mapa completo de lacunas e dívidas, ver [`tech-debt.md`](./tech-debt.md).
