# Guia de Testes da API — Billing Automation

Documento de referência para testar **todas as rotas** (Postman, Insomnia ou `curl`) e confirmar que a aplicação está funcionando ponta a ponta.

- **Base URL**: `http://SEU_HOST:3000` (local: `http://localhost:3000` · EC2: `http://IP_PUBLICO:3000`)
- **Prefixo de todas as rotas**: `/api`
- **Formato**: JSON (`Content-Type: application/json`)
- **Autenticação**: JWT `Bearer` no header `Authorization` (obtido no login). Exceções: `/auth/*`, `/health` e `/invoices/webhook`.

> Há uma coleção pronta pra importar: `postman/billing-automation.postman_collection.json` (folders + token automático).

---

## Pré-requisitos no `.env` (servidor)

| Variável | Necessária para | Valor de teste |
|---|---|---|
| `JWT_SECRET` | login/register e todas as rotas com JWT | qualquer segredo forte |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | login via conta de serviço (bootstrap) | ex.: `admin` / `sua-senha` |
| `WEBHOOK_SECRET` | teste do webhook de pagamento (provider mock) | qualquer segredo forte |
| `PAYMENT_PROVIDER` | criação de cobrança | `mock` (default — não cobra) |
| `WHATSAPP_PROVIDER` | notificações | `log` (default — só loga) |

---

## Ordem recomendada (fluxo ponta a ponta)

1. **Health** → confirma que subiu.
2. **Login** (ou Register) → obtém o `token`.
3. **Create Client** → guarda o `clientId`.
4. **Create Invoice** → guarda o `gatewayId` e o `invoiceId`.
5. **Webhook PAID** → confirma pagamento; repetir para testar **idempotência**.
6. **Notifications** e **LGPD**.

Variáveis que você vai reaproveitar: `token`, `clientId`, `gatewayId`, `invoiceId`.

---

## 1) Health

### GET `/api/health` — público
Confere se a API está no ar.

```bash
curl http://localhost:3000/api/health
```
**Espera:** `200 OK`.

---

## 2) Auth (público)

### POST `/api/auth/register`
Cria uma **conta (tenant) + usuário dono** e já retorna um token.

**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `accountName` | string | mín. 2 |
| `name` | string | mín. 2 |
| `email` | string | e-mail válido |
| `password` | string | mín. 8 |

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"accountName":"Minha Empresa","name":"Cassio","email":"cassio@exemplo.com","password":"senha-forte-123"}'
```
**Respostas:** `201` `{ token, expiresIn }` · `409` e-mail já cadastrado · `400` validação · `500` `JWT_SECRET` ausente.

### POST `/api/auth/login`
Emite o JWT. `username` pode ser o **e-mail de um usuário real** OU o `AUTH_USERNAME` (conta de serviço).

**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `username` | string | mín. 1 |
| `password` | string | mín. 1 |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sua-senha"}'
```
**Respostas:** `200` `{ token, expiresIn }` · `401` credenciais inválidas · `400` validação · `500` auth não configurada.

> Guarde o `token`. Nas rotas protegidas, envie o header:
> `Authorization: Bearer SEU_TOKEN`

---

## 3) Clients (exige JWT)

### POST `/api/clients` — cria cliente
**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `name` | string | mín. 3 |
| `phone` | string | mín. 10 dígitos |
| `document` | string | mín. 11 |

```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Cliente Teste","phone":"11999998888","document":"12345678901"}'
```
**Respostas:** `201` cliente criado · `400` validação · `401` sem token.
> Telefone é único **por tenant** — repetir o mesmo telefone deve falhar.

### POST `/api/clients/import` — importação em lote (upsert por telefone)
Upsert **idempotente** por telefone (spec 0008). Reenviar o mesmo lote **não duplica**: telefone novo cria, existente atualiza (name/document/status).

**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `clients` | array | 1 a 1000 linhas |
| `clients[].name` | string | mín. 3 |
| `clients[].phone` | string | mín. 10 (chave de idempotência) |
| `clients[].document` | string | mín. 11 |
| `clients[].status` | enum? | `EM_DIA` \| `EM_ATRASO` (opcional) |

```bash
curl -X POST http://localhost:3000/api/clients/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"clients":[{"name":"Ana Souza","phone":"11999990001","document":"12345678901"},{"name":"Bia Lima","phone":"11999990002","document":"98765432100","status":"EM_ATRASO"}]}'
```
**Respostas:** `200 { criados, atualizados, ignorados }` · `400` lote vazio/>1000 ou linha inválida.
> Rode o mesmo comando duas vezes: na 1ª vêm em `criados`, na 2ª em `atualizados` (prova de idempotência). Telefone repetido no lote conta em `ignorados`.

### GET `/api/clients` — lista clientes do tenant
```bash
curl http://localhost:3000/api/clients -H "Authorization: Bearer $TOKEN"
```

### GET `/api/clients/:id` — busca por id
```bash
curl http://localhost:3000/api/clients/CLIENT_ID -H "Authorization: Bearer $TOKEN"
```

### PUT `/api/clients/:id` — atualiza (campos opcionais)
**Body** (todos opcionais): `name`, `phone`, `document`.
```bash
curl -X PUT http://localhost:3000/api/clients/CLIENT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Cliente Teste (editado)","phone":"11988887777"}'
```

### DELETE `/api/clients/:id`
```bash
curl -X DELETE http://localhost:3000/api/clients/CLIENT_ID -H "Authorization: Bearer $TOKEN"
```

---

## 4) Invoices (cobranças)

### POST `/api/invoices` — gera cobrança (exige JWT)
Cria a fatura e gera a cobrança no gateway ativo (mock por padrão).

**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `clientId` | string | UUID de um cliente existente |
| `value` | number | > 0 — **opcional se enviar `items`** |
| `dueDate` | string | data ISO (`YYYY-MM-DD` ou ISO completo) |
| `items` | array? | itens `{ description, quantity?, unitPrice }`; total = soma (spec 0007) |

```bash
# Simples (só valor):
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":"CLIENT_ID","value":150.90,"dueDate":"2026-08-01"}'

# Com itens (total calculado = 2*50 + 1*90.90 = 190.90):
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":"CLIENT_ID","dueDate":"2026-08-01","items":[{"description":"Aula avulsa","quantity":2,"unitPrice":50},{"description":"Taxa","quantity":1,"unitPrice":90.90}]}'
```
**Resposta `201`** (campos principais):
```json
{
  "id": "…",
  "value": 150.9,
  "status": "PENDING",
  "gatewayId": "pay_xxxxx",
  "pixCopyPaste": "00020101…_MOCK_…",
  "pixQrCode": null,
  "checkoutUrl": null,
  "dueDate": "2026-08-01T00:00:00.000Z",
  "clientId": "CLIENT_ID"
}
```
> Guarde o `gatewayId` — é ele que o webhook usa. `400` em validação (value ≤ 0, dueDate inválida, clientId não-UUID).

### GET `/api/invoices?page=1&limit=10` — lista TODAS as faturas do tenant (exige JWT)
Filtro opcional por status: `?status=PAID` (valores: `PENDING`, `PAID`, `OVERDUE`, `FAILED`).
```bash
curl "http://localhost:3000/api/invoices?page=1&limit=10&status=PAID" -H "Authorization: Bearer $TOKEN"
```
**Respostas:** `200` `{ message, result: { invoices, meta } }` · `400` se `status` inválido.

### GET `/api/invoices/:id` — busca UMA fatura (exige JWT)
Útil para ver a fatura que você pagou, já como `PAID`.
```bash
curl http://localhost:3000/api/invoices/INVOICE_ID -H "Authorization: Bearer $TOKEN"
```
**Respostas:** `200` com a fatura (+ dados do cliente) · `404` se não existir (ou for de outro tenant).

### GET `/api/invoices/overdue?page=1&limit=10` — lista pendentes de clientes EM_ATRASO (exige JWT)
```bash
curl "http://localhost:3000/api/invoices/overdue?page=1&limit=10" -H "Authorization: Bearer $TOKEN"
```
**Respostas:** `200` `{ message, result: { invoices, meta } }` · `404` quando não há nenhuma.

### POST `/api/invoices/webhook` — confirma pagamento (SEM JWT)
Autenticação é do **provider**. No `mock`: header `x-webhook-secret` = `WEBHOOK_SECRET`.

**Headers**: `Content-Type: application/json` · `x-webhook-secret: SEU_WEBHOOK_SECRET`

**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `gatewayId` | string | o `gatewayId` da fatura |
| `status` | string | `PENDING` \| `PAID` \| `OVERDUE` \| `FAILED` |
| `paidAt` | string? | data ISO (quando `PAID`) |
| `eventId` | string? | chave de idempotência |

```bash
curl -X POST http://localhost:3000/api/invoices/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"gatewayId":"pay_xxxxx","status":"PAID","paidAt":"2026-07-15T12:00:00.000Z","eventId":"evt-001"}'
```
**Respostas:**
- `200` `{ success:true, duplicate:false }` — processado.
- `200` `{ success:true, duplicate:true }` — **idempotência**: mesmo `eventId` reenviado (não reprocessa).
- `200` `{ success:true, ignored:true }` — evento irrelevante/incompleto.
- `401` assinatura/segredo inválido · `404` fatura do `gatewayId` não encontrada · `500` `WEBHOOK_SECRET` ausente.

> **Teste de idempotência:** rode o mesmo comando 2x com o mesmo `eventId`. 1ª → `duplicate:false`; 2ª → `duplicate:true`.

---

## 4.1) Subscriptions — cobrança recorrente (exige JWT) · spec 0009

Um "molde" de mensalidade por cliente. O agendador (n8n) chama `POST /run` diariamente e gera as faturas das assinaturas vencidas, **sem duplicar por competência**.

### POST `/api/subscriptions` — cria assinatura
**Body**
| Campo | Tipo | Regra |
|---|---|---|
| `clientId` | string | UUID de cliente existente |
| `description` | string | vira o item da fatura gerada |
| `amount` | number | > 0 (valor mensal) |
| `dayOfMonth` | number? | 1..28 (default 10) |
| `startDate` | string? | ISO; default agora |

```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":"CLIENT_ID","description":"Plano Pro","amount":99.90,"dayOfMonth":10}'
```
**Resposta `201`** com a assinatura (guarde o `id`). O `nextRunDate` é o dia `dayOfMonth` do mês corrente (se ainda não passou) ou do mês seguinte.

### GET `/api/subscriptions` · GET `/api/subscriptions/:id`
```bash
curl http://localhost:3000/api/subscriptions -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/subscriptions/SUB_ID -H "Authorization: Bearer $TOKEN"
```

### PUT `/api/subscriptions/:id` — pausar / retomar / cancelar / editar
Campos opcionais: `description`, `amount`, `dayOfMonth`, `status` (`ACTIVE` | `PAUSED` | `CANCELED`).
```bash
curl -X PUT http://localhost:3000/api/subscriptions/SUB_ID \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"PAUSED"}'
```

### POST `/api/subscriptions/run` — geração recorrente (o que o n8n chama)
```bash
curl -X POST http://localhost:3000/api/subscriptions/run -H "Authorization: Bearer $TOKEN"
```
**Resposta `200`** `{ processadas, geradas, ignoradas }`.
> **Teste de idempotência:** rode 2x seguidas. Na 1ª a competência vem em `geradas`; na 2ª, em `ignoradas` (não duplica). As faturas geradas aparecem em `GET /api/invoices`.

### DELETE `/api/subscriptions/:id`
```bash
curl -X DELETE http://localhost:3000/api/subscriptions/SUB_ID -H "Authorization: Bearer $TOKEN"
```
> Remove só a assinatura; as faturas já geradas permanecem (histórico).

---

## 5) Notifications (exige JWT)

Enfileiram cobranças no RabbitMQ; o worker consome e (com `WHATSAPP_PROVIDER=log`) apenas **loga** — não envia de verdade.

### POST `/api/notifications/trigger-overdue` — dispara todas as vencidas
```bash
curl -X POST http://localhost:3000/api/notifications/trigger-overdue \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}'
```

### POST `/api/notifications/trigger-overdue/:invoiceId` — dispara uma fatura
```bash
curl -X POST http://localhost:3000/api/notifications/trigger-overdue/INVOICE_ID \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}'
```
> Verifique nos logs do **worker** o consumo da fila (`docker compose -f docker-compose.free.yml logs -f worker`).

---

## 6) LGPD (exige JWT)

### GET `/api/lgpd/clients/:clientId/export` — portabilidade
Exporta os dados do titular (cliente + faturas).
```bash
curl http://localhost:3000/api/lgpd/clients/CLIENT_ID/export -H "Authorization: Bearer $TOKEN"
```

### POST `/api/lgpd/clients/:clientId/anonymize` — direito ao esquecimento
Anonimiza o titular preservando registros financeiros (retenção legal). **Idempotente**.
```bash
curl -X POST http://localhost:3000/api/lgpd/clients/CLIENT_ID/anonymize \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}'
```

---

## Checklist de validação

- [ ] `GET /api/health` → 200
- [ ] `POST /api/auth/register` → 201 (ou 409 se já existe)
- [ ] `POST /api/auth/login` → 200 + token
- [ ] Rota protegida **sem** token → 401
- [ ] `POST /api/clients` → 201
- [ ] `POST /api/clients/import` → 200; rodar 2× prova idempotência (criados→atualizados)
- [ ] Telefone duplicado no mesmo tenant → erro
- [ ] `GET /api/clients` → lista contém o criado
- [ ] `GET/PUT/DELETE /api/clients/:id` → OK
- [ ] `POST /api/invoices` → 201 + `gatewayId`
- [ ] `POST /api/invoices` com `value:0` → 400
- [ ] `GET /api/invoices` → 200 lista as faturas do tenant
- [ ] `GET /api/invoices?status=PAID` → só as pagas · `?status=XPTO` → 400
- [ ] `GET /api/invoices/:id` existente → 200 · inexistente → 404
- [ ] `GET /api/invoices/overdue` → 200 ou 404
- [ ] `POST /api/subscriptions` → 201 (guarda `id`, `nextRunDate` no dayOfMonth)
- [ ] `POST /api/subscriptions/run` → 200; rodar 2× prova idempotência (geradas→ignoradas)
- [ ] `PUT /api/subscriptions/:id {status:PAUSED}` → não gera no próximo `run`
- [ ] `DELETE /api/subscriptions/:id` → 204; faturas geradas continuam em `GET /api/invoices`
- [ ] `POST /api/invoices/webhook` (PAID) → `duplicate:false`
- [ ] Webhook com **mesmo eventId** → `duplicate:true`
- [ ] Webhook com segredo errado → 401
- [ ] `POST /api/notifications/trigger-overdue` → 2xx + log no worker
- [ ] `GET /api/lgpd/clients/:id/export` → 200 com dados
- [ ] `POST /api/lgpd/clients/:id/anonymize` → 200 (idempotente)

---

## Tabela-resumo das rotas

| Método | Rota | Auth | Body / Params |
|---|---|---|---|
| GET | `/api/health` | — | — |
| POST | `/api/auth/register` | — | `accountName, name, email, password` |
| POST | `/api/auth/login` | — | `username, password` |
| POST | `/api/clients` | JWT | `name, phone, document` |
| POST | `/api/clients/import` | JWT | `clients[]` (upsert por telefone) |
| GET | `/api/clients` | JWT | — |
| GET | `/api/clients/:id` | JWT | path `id` |
| PUT | `/api/clients/:id` | JWT | `name?, phone?, document?` |
| DELETE | `/api/clients/:id` | JWT | path `id` |
| POST | `/api/invoices` | JWT | `clientId, value, dueDate` |
| GET | `/api/invoices` | JWT | query `page, limit, status?` |
| GET | `/api/invoices/:id` | JWT | path `id` |
| GET | `/api/invoices/overdue` | JWT | query `page, limit` |
| POST | `/api/invoices/webhook` | header `x-webhook-secret` | `gatewayId, status, paidAt?, eventId?` |
| POST | `/api/subscriptions` | JWT | `clientId, description, amount, dayOfMonth?, startDate?` |
| GET | `/api/subscriptions` | JWT | — |
| GET | `/api/subscriptions/:id` | JWT | path `id` |
| PUT | `/api/subscriptions/:id` | JWT | `description?, amount?, dayOfMonth?, status?` |
| POST | `/api/subscriptions/run` | JWT | — (agendador n8n) |
| DELETE | `/api/subscriptions/:id` | JWT | path `id` |
| POST | `/api/notifications/trigger-overdue` | JWT | — |
| POST | `/api/notifications/trigger-overdue/:invoiceId` | JWT | path `invoiceId` |
| GET | `/api/lgpd/clients/:clientId/export` | JWT | path `clientId` |
| POST | `/api/lgpd/clients/:clientId/anonymize` | JWT | path `clientId` |
