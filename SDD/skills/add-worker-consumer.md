# Playbook: Adicionar Processamento Assíncrono (Fila + Worker)

Use quando uma ação deve responder rápido ao cliente e processar pesado em background (ex.: enviar mensagem, chamar API externa lenta).

## Padrão do projeto

Produtor (Service) → `publishRabbitMql(fila, msg)` → RabbitMQ → Consumidor (Worker).

Regras fixas do projeto (ver `conventions.md`):
- Fila **durável**, tipo **quorum**: `{ durable: true, arguments: { 'x-queue-type': 'quorum' } }`.
- Publicar com `{ persistent: true }`.
- Consumir com `prefetch(1)`, **ACK manual**.

## 1. Publicar (lado do Service)

```ts
import { publishRabbitMql } from '../messaging/publish/publish.messaging.js';

const QUEUE = 'minha_nova_fila';

async enqueueAlgo(payload: MeuDTO): Promise<void> {
  await publishRabbitMql(QUEUE, JSON.stringify(payload));
}
```
- Payload sempre serializado com `JSON.stringify`.
- O controller que chama isso responde `202 Accepted`.

## 2. Consumir (novo worker)

Crie `src/works/<nome>.worker.ts` espelhando `invoice.worker.ts`:

```ts
import { rabbitMQ } from '../config/rabbitmql.config.js';

export async function initMeuWorker() {
  const channel = rabbitMQ.getChannel();
  const queue = 'minha_nova_fila';

  await channel.assertQueue(queue, {
    durable: true,
    arguments: { 'x-queue-type': 'quorum' },
  });
  channel.prefetch(1);

  channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      // ... lógica de negócio ...
      channel.ack(msg);
    } catch (err) {
      console.error('❌ erro worker:', err);
      channel.nack(msg, false, true); // ⚠️ requeue — ver aviso abaixo
    }
  }, { noAck: false });
}
```

## 3. Registrar a inicialização

- Chame `initMeuWorker()` no processo de worker (`src/worker.ts`) após a conexão com o RabbitMQ.
- ⚠️ **Não** duplique a inicialização na API e no worker isolado (ver dívida **D-03**). Defina um único lugar.

## ⚠️ Cuidado com requeue infinito (dívida D-04)

`nack(msg, false, true)` devolve a mensagem para sempre se o erro for permanente. Para código novo, prefira:
- Limitar tentativas (contador no header/payload) e **descartar ou mandar para DLQ** ao exceder.
- Distinguir erro transitório (requeue) de permanente (ACK + log/DLQ).

## Verificação

- Publique uma mensagem (via endpoint) e confirme nos logs do worker o consumo + ACK.
- Verifique no painel do RabbitMQ que a fila esvazia e não acumula mensagens em loop.
- Teste o caminho de erro (payload inválido) e confirme que não entra em loop infinito.
