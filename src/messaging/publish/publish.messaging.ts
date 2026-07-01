import { rabbitMQ } from '../../config/rabbitmql.config.js';

/**
 * Publica uma mensagem persistente numa fila.
 *
 * A topologia da fila (incluindo DLX/limite de entregas) é declarada no
 * startup — ver `assertInvoiceQueueTopology` em `messaging/invoice-queue.ts`,
 * chamada por `server.ts` e pelo worker. Por isso aqui apenas enviamos, sem
 * `assertQueue` (redeclarar com argumentos diferentes quebraria a fila).
 */
export async function publishRabbitMql(queue: string, msg: string): Promise<void> {
  const channel = rabbitMQ.getChannel();

  channel.sendToQueue(queue, Buffer.from(msg), { persistent: true });

  console.log(" [x] Sent '%s' to queue '%s'", msg, queue);
}
