# Convenções de Código

Padrões observados no código atual. Ao criar código novo, **siga o que já existe** para manter consistência. Onde há inconsistência, o padrão recomendado está marcado como ✅ **Preferir**.

## Módulos e imports (ESM + NodeNext)

- O projeto é ESM (`"type": "module"`). **Imports internos usam extensão `.js`**, mesmo apontando para arquivos `.ts`:
  ```ts
  import { InvoiceService } from '../services/invoice.service.js'; // ✅ mesmo sendo .ts
  ```
- Esquecer o `.js` quebra em runtime. Este é o erro mais comum no projeto.

## Nomenclatura de arquivos

Padrão predominante: `nome.camada.ts`.

| Camada | Padrão | Exemplo |
|---|---|---|
| Router | `<domínio>.router.ts` | `invoice.router.ts` |
| Controller | `<domínio>.controller.ts` | `clients.controller.ts` |
| Service | `<domínio>.service.ts` | `invoice.service.ts` |
| Repository | `<domínio>.repository.ts` | `invoice.repository.ts` |
| DTO | `<ação><Entidade>.dto.ts` | `createInvoice.dto.ts` |

> ⚠️ **Existem grafias inconsistentes** no repo (ver `tech-debt.md`):
> `notication.service.ts` (falta "if"), `cliente.repositorie.ts` (grafia errada, e em PT), `rabbitmql.config.ts` ("mql" em vez de "mq").
> ✅ **Preferir** para arquivos novos: inglês, grafia correta, sufixo padrão (`.repository.ts`, `.config.ts`).

## Classes e organização

- **Controllers, Services e Repositories são classes.** Instanciadas diretamente (`new XService()`), sem container de DI.
  ```ts
  export class ClientService {
    private repository: ClientRepository;
    constructor() { this.repository = new ClientRepository(); }
  }
  ```
- Config de conexão (RabbitMQ) é **singleton exportado** (`export const rabbitMQ = new RabbitMQConfig()`).
- Prisma é **singleton default export** (`src/database/prisma.ts`).

## Controllers

- Dois estilos coexistem:
  - Métodos `async` normais → precisam de `.bind(controller)` no router (ver `clients.router.ts`).
  - **Arrow functions como propriedades** → dispensam `.bind` (ver `invoice.controller.ts`). ✅ **Preferir** este, evita bug de `this`.
- Retornam `res.status(...).json(...)`. Tratam erro com `try/catch` e mapeiam para status HTTP.
- **Não contêm regra de negócio nem acesso a banco.**

## Validação (DTOs)

Dois padrões coexistem:
- ✅ **Preferir Zod**: `createInvoice.dto.ts`, `createClient.dto.ts` — definem `schema`, exportam o tipo via `z.infer` e uma função `validateX` ou usam `schema.parse()` no controller.
  ```ts
  export const createClientSchema = z.object({ /* ... */ });
  export type CreateClientDTO = z.infer<typeof createClientSchema>;
  export function validateCreateClient(p: unknown) { return createClientSchema.parse(p); }
  ```
- ❌ **Evitar**: validação manual com `if`/`throw` (ex.: `triggerNotification.dto.ts`) — mais verboso e fácil de divergir. Migrar para Zod quando tocar nesses arquivos.

## Tratamento de erros

- Erros de negócio são lançados como `Error` com mensagem em **português** (ex.: `throw new Error('INVOICE_NOT_FOUND')` ou mensagens descritivas).
- Controllers capturam e mapeiam:
  - `400` → validação/entrada inválida
  - `404` → não encontrado
  - `500` → erro interno
- Códigos sentinela (ex.: `'INVOICE_NOT_FOUND'`) são comparados por string no controller. Padrão simples, mas frágil — considerar erros tipados no futuro.

## Mensageria

- Nome da fila principal centralizado como string: `'invoice_processing_queue'`.
- Sempre `assertQueue` com `{ durable: true, arguments: { 'x-queue-type': 'quorum' } }` antes de publicar/consumir.
- Publicar com `{ persistent: true }`.
- Consumir com `prefetch(1)`, ACK manual, `nack(msg, false, true)` para requeue.

## Idioma

- **Código/identificadores**: majoritariamente inglês (com exceções em PT).
- **Logs e mensagens de erro**: português, frequentemente com emojis (`✅`, `❌`, `⚠️`, `🔌`).
- **Comentários e docs**: português.
- ✅ Mantenha o padrão do arquivo que está editando.

## Respostas HTTP (convenção observada)

| Situação | Status |
|---|---|
| Criação bem-sucedida | `201` |
| Aceito para processamento assíncrono | `202` |
| Sucesso sem corpo (delete) | `204` |
| Sucesso com corpo | `200` |
| Entrada inválida | `400` |
| Não encontrado | `404` |
| Erro interno | `500` |
