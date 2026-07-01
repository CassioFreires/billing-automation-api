# Modelo de Domínio

Fonte da verdade dos dados: `prisma/schema.prisma`. Fonte da verdade das **regras**: este documento.

## Entidades

### Account (Tenant / Conta do SaaS)

Conta contratante. **Todo dado de negócio pertence a um Account** (multi-tenancy — ver `../specs/0001-multi-tenancy.md`).

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK. Tenant "default" seedado: `00000000-0000-0000-0000-000000000001` |
| `name` | String | — | Nome da conta |
| `status` | String | `ACTIVE` | `ACTIVE`, `SUSPENDED` |
| `createdAt` | DateTime | `now()` | — |
| `clients` / `invoices` | relações | — | 1-N |

### Client (Cliente)

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `name` | String | — | Mín. 3 caracteres (validação no DTO) |
| `phone` | String | — | **Único por tenant** (`@@unique([tenantId, phone])`). Mín. 10 dígitos. Chave de busca do worker |
| `document` | String | — | CPF/CNPJ. Mín. 11 caracteres |
| `status` | String | `EM_DIA` | Estado de adimplência (ver máquina de estados) |
| `debtValue` | Float | `0.0` | Valor total em dívida |
| `processed` | Boolean | `false` | Flag de processamento |
| `lastUpdate` | DateTime | `@updatedAt` | Atualizado automaticamente |
| `createdAt` | DateTime | `now()` | — |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`). Escopo obrigatório |
| `invoices` | Invoice[] | — | Relação 1-N |

Índices: `@@unique([tenantId, phone])`, `@@index([status])`, `@@index([tenantId, status])`.

### Invoice (Fatura)

| Campo | Tipo | Padrão | Notas |
|---|---|---|---|
| `id` | String (uuid) | gerado | PK |
| `value` | Float | — | Valor da cobrança (> 0) |
| `status` | String | `PENDING` | Ver máquina de estados |
| `pixCopyPaste` | String? | — | "Copia e cola" do PIX gerado pelo gateway |
| `pixQrCode` | String? | — | Link/Base64 do QR Code |
| `gatewayId` | String? | — | **Único**. ID da cobrança no gateway (Asaas/Stripe) |
| `dueDate` | DateTime | — | Vencimento |
| `paidAt` | DateTime? | — | Preenchido pelo webhook ao confirmar pagamento |
| `createdAt` | DateTime | `now()` | — |
| `notificationSent` | Boolean | `false` | `true` após o worker enviar a cobrança |
| `clientId` | String | — | FK → Client (`onDelete: Cascade`) |
| `tenantId` | String | — | FK → Account (`onDelete: Cascade`). Escopo obrigatório |

Índices: `@@index([clientId])`, `@@index([status])`, `@@index([status, clientId])`, `@@index([tenantId, status])`, `@@index([tenantId, clientId])`.

## Máquinas de estado

### Status do Cliente
```
EM_DIA  ──(atrasa)──►  EM_ATRASO
   ▲                        │
   └──────(regulariza)──────┘
```
- Valores conhecidos: `EM_DIA` (padrão), `EM_ATRASO`.
- `EM_ATRASO` é filtro obrigatório em `findPendingInvoices` (só notifica inadimplentes).
- ⚠️ `status` é `String` livre no schema — não há enum garantindo os valores. Ver `tech-debt.md`.

### Status da Fatura
```
PENDING ──► PAID
   │
   ├──────► OVERDUE
   │
   └──────► FAILED
```
- Valores válidos (enum no DTO `updateInvoiceStatusSchema`): `PENDING`, `PAID`, `OVERDUE`, `FAILED`.
- `PENDING` → `PAID`: via webhook, preenche `paidAt`.
- ⚠️ No banco `status` é `String` (não enum Prisma). O enum só existe na validação Zod do webhook.

## Regras de negócio

### Multi-tenancy (ver `../specs/0001-multi-tenancy.md`)
- **RN-T1**: Todo `Client`/`Invoice` pertence a exatamente um `Account` (`tenantId` obrigatório).
- **RN-T2**: Toda leitura/escrita interna é escopada por `tenantId` (via `tenant-context`), exceto entradas globais legítimas (`findByGatewayId` no webhook).
- **RN-T3**: `Client.phone` é único **por tenant** (dois tenants podem ter o mesmo telefone).
- **RN-T4**: O `tenantId` vem do JWT (contexto), nunca do corpo/params.
- **RN-T5**: O `tenantId` viaja no payload da fila; o worker processa no tenant da mensagem.
- **RN-T6**: O webhook resolve o tenant pela fatura (`gatewayId` → `Invoice.tenantId`).

### Clientes
- **RN-C1**: Telefone é único. Criar cliente com telefone existente → erro `"Já existe um cliente com este telefone."`.
- **RN-C2**: Nome ≥ 3 caracteres, telefone ≥ 10 dígitos, documento ≥ 11 caracteres (validação Zod).
- **RN-C3**: Deletar cliente remove suas faturas em cascata (`onDelete: Cascade`).

### Faturas
- **RN-I1**: Valor deve ser positivo (`> 0`).
- **RN-I2**: Ao criar, a fatura nasce `PENDING` com `gatewayId`/`pixCopyPaste` gerados (hoje mockados).
- **RN-I3**: Webhook só atualiza fatura existente (localizada por `gatewayId`); senão erro `"Fatura correspondente ao Gateway não encontrada."`.
- **RN-I4**: `gatewayId` é único — não pode haver duas faturas com o mesmo ID de gateway.

### Notificação / Cobrança
- **RN-N1**: Só entram na listagem de cobrança faturas `PENDING` cujo **cliente** esteja `EM_ATRASO`.
- **RN-N2**: O disparo é **assíncrono**: a API enfileira e responde `202`; o envio real ocorre no worker.
- **RN-N3**: Se o worker não encontrar o cliente pelo telefone, a mensagem é **descartada (ACK)** — não faz requeue.
- **RN-N4**: Após enviar, a fatura recebe `notificationSent = true`.
- **RN-N5**: Erros no processamento do worker fazem `nack(requeue: true)` → a mensagem volta para a fila (risco de loop em erro permanente — ver `tech-debt.md`).

## Glossário

- **Gateway**: provedor de pagamento externo (Asaas, Stripe). Hoje simulado.
- **PIX copia-e-cola**: string do PIX para o cliente pagar.
- **Inadimplente**: cliente com `status = EM_ATRASO`.
- **Notificação/Cobrança**: mensagem de WhatsApp enviada para cobrar uma fatura pendente.
