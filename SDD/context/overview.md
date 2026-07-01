# Overview — billing-automation-api

## O que é

API de **automação de cobrança**. O sistema gerencia clientes e faturas (invoices) e dispara **notificações de cobrança via WhatsApp** de forma assíncrona para clientes inadimplentes, gerando dados de pagamento (PIX / gateway) no processo.

## Capacidades atuais

| Capacidade | Descrição | Estado |
|---|---|---|
| Autenticação | Login de conta de serviço (`/api/auth/login`) emitindo JWT; rotas internas protegidas por Bearer, webhook por segredo | ✅ Funcional (conta única via env — ver D-16) |
| CRUD de Clientes | Criar, listar, buscar, atualizar e remover clientes | ✅ Funcional |
| Criação de Faturas | Gerar cobrança atrelada a um cliente (PIX/gateway mockado) | ✅ Funcional (gateway simulado) |
| Webhook de Pagamento | Receber confirmação de pagamento e atualizar status da fatura | ✅ Funcional |
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
5. Worker processa ..................... consome a fila
     ├── busca cliente pelo telefone
     ├── gera PIX/gatewayId
     ├── marca notificationSent = true
     └── envia WhatsApp (stub)
6. Cliente paga ........................ gateway chama POST /api/invoices/webhook
     └── status vira PAID
```

## Público / integrações externas

- **Front-end**: chama `POST /api/invoices` para gerar cobranças manuais.
- **n8n / Gateway de pagamento** (ex.: Asaas, Stripe): chama `POST /api/invoices/webhook` para confirmar pagamentos.
- **WhatsApp**: destino final das notificações (integração ainda não implementada — ver `tech-debt.md`).

## O que este sistema **não** faz (ainda)

- Não integra com gateway de pagamento real (IDs de gateway e PIX são gerados fake).
- Não envia WhatsApp de verdade.
- Não tem modelo de usuário/multiusuário — a auth usa uma conta de serviço única via env (ver D-16).
- Não tem testes automatizados.
- Não há job/scheduler que detecte atrasos automaticamente — o disparo é acionado externamente.

> Para o mapa completo de lacunas e dívidas, ver [`tech-debt.md`](./tech-debt.md).
