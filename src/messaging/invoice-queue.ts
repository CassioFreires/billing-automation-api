import type { Channel } from 'amqplib';

/**
 * Topologia da fila de processamento de faturas (fonte única de verdade).
 *
 * A fila principal é quorum e usa o mecanismo nativo de poison-message do
 * RabbitMQ: `x-delivery-limit`. Quando uma mensagem é reentregue mais vezes
 * que o limite, o broker a envia para a Dead Letter Exchange (DLX) em vez de
 * ficar em requeue infinito (dívida D-04).
 */

export const INVOICE_QUEUE = 'invoice_processing_queue';
export const INVOICE_DLX = 'invoice_processing_dlx';
export const INVOICE_DLQ = 'invoice_processing_queue.dlq';

/** Nº máximo de entregas antes de mandar a mensagem para a DLQ. */
export const INVOICE_DELIVERY_LIMIT = 5;

/**
 * Declara (idempotente) toda a topologia da fila de faturas: a DLX, a DLQ
 * atrelada a ela e a fila principal com dead-lettering + limite de entregas.
 *
 * ⚠️ Se a fila `invoice_processing_queue` já existir SEM esses argumentos
 * (versões anteriores), o RabbitMQ recusa a redeclaração (PRECONDITION_FAILED).
 * Nesse caso é preciso remover a fila antiga uma vez. Ver SDD/skills/run-and-debug.md.
 */
export async function assertInvoiceQueueTopology(channel: Channel): Promise<void> {
  // Dead Letter Exchange + fila de mortas
  await channel.assertExchange(INVOICE_DLX, 'fanout', { durable: true });

  await channel.assertQueue(INVOICE_DLQ, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
    },
  });

  await channel.bindQueue(INVOICE_DLQ, INVOICE_DLX, '');

  // Fila principal: quorum + dead-letter + limite de entregas
  await channel.assertQueue(INVOICE_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': INVOICE_DLX,
      'x-delivery-limit': INVOICE_DELIVERY_LIMIT,
    },
  });
}
