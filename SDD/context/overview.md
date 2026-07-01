# Overview — billing-automation-api

## O que é

API de **automação de cobrança**. O sistema gerencia clientes e faturas (invoices) e dispara **notificações de cobrança via WhatsApp** de forma assíncrona para clientes inadimplentes, gerando dados de pagamento (PIX / gateway) no processo.

## Capacidades atuais

| Capacidade | Descrição | Estado |
|---|---|---|
| Autenticação | Login de conta de serviço (`/api/auth/login`) emitindo JWT; rotas internas protegidas por Bearer, webhook por segredo | ✅ Funcional (conta única via env — ver D-16) |
| CRUD de Clientes | Criar, listar, buscar, atualizar e remover clientes | ✅ Funcional |
| Criação de Faturas | Gerar cobrança via gateway (`mock` default; Mercado Pago Checkout Pro real) | ✅ Funcional (seam `PAYMENT_PROVIDER`) |
| Webhook de Pagamento | Receber confirmação e atualizar status, de forma **idempotente** | ✅ Funcional (verificação por provider) |
| Listagem de inadimplentes | Listar faturas pendentes de clientes `EM_ATRASO`, com paginação e cache | ✅ Funcional |
| Enfileiramento de notificações | Enfileirar faturas em atraso para processamento assíncrono | ✅ Funcional |
| Envio de WhatsApp | Worker consome a fila e "envia" a mensagem de cobrança | ⚠️ **Seam log-only** — `WhatsappAPI` tem contrato de provider (D-02); provider padrão só loga, provedor real ainda não plugado |
| Cache de leitura | Cache Redis (opcional) para faturas pendentes | ✅ Funcional com fallback |

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

- **Front-end**: chama `POST /api/invoices` para gerar cobranças manuais.
- **n8n / Gateway de pagamento** (ex.: Asaas, Stripe): chama `POST /api/invoices/webhook` para confirmar pagamentos.
- **WhatsApp**: destino final das notificações (integração ainda não implementada — ver `tech-debt.md`).

## O que este sistema **não** faz (ainda)

- **Não envia WhatsApp de verdade** — o seam está em `log-only` (D-02; falta plugar Meta/Twilio).
- Gateway real (Mercado Pago) está **implementado mas em modo `mock` por default** — precisa de `MP_ACCESS_TOKEN` de sandbox e teste ponta-a-ponta (spec 0003).
- Não há LGPD (base legal, política de privacidade, termos) — pré-requisito para comercializar (PR-06).
- Multiusuário por conta, verificação de e-mail, reset de senha e RBAC ainda não existem (auth cobre signup/login básicos — spec 0002).
- Não há job/scheduler que detecte atrasos automaticamente — o disparo é acionado externamente.
- Sem observabilidade/CI-CD de produção ainda (ver `production-readiness.md`).

> Para o mapa completo de lacunas e dívidas, ver [`tech-debt.md`](./tech-debt.md).
