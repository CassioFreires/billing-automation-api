import type { Channel } from 'amqplib';

/**
 * Topologia da fila do agendador de cobrança recorrente (spec 0010).
 *
 * Mesmo padrão da fila de faturas: quorum + Dead Letter Exchange + limite de
 * entregas (poison-message via `x-delivery-limit`). Cada mensagem representa
 * "gere a cobrança recorrente do tenant X" — o worker processa um tenant por vez.
 */

export const BILLING_QUEUE = 'billing_scheduler_queue';
export const BILLING_DLX = 'billing_scheduler_dlx';
export const BILLING_DLQ = 'billing_scheduler_queue.dlq';

/** Nº máximo de entregas antes de mandar a mensagem para a DLQ. */
export const BILLING_DELIVERY_LIMIT = 5;

/** Declara (idempotente) a DLX, a DLQ e a fila principal com dead-lettering. */
export async function assertBillingQueueTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(BILLING_DLX, 'fanout', { durable: true });

  await channel.assertQueue(BILLING_DLQ, {
    durable: true,
    arguments: { 'x-queue-type': 'quorum' },
  });

  await channel.bindQueue(BILLING_DLQ, BILLING_DLX, '');

  await channel.assertQueue(BILLING_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': BILLING_DLX,
      'x-delivery-limit': BILLING_DELIVERY_LIMIT,
    },
  });
}
