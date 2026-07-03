import { rabbitMQ } from '../config/rabbitmql.config.js';
import { BillingSchedulerService, BillingJob } from '../services/billing-scheduler.service.js';
import {
  BILLING_QUEUE,
  BILLING_DELIVERY_LIMIT,
  assertBillingQueueTopology,
} from '../messaging/billing-scheduler-queue.js';

const scheduler = new BillingSchedulerService();

/**
 * Worker da cobrança recorrente (spec 0010). Consome a fila `billing`, um
 * tenant por vez (prefetch 1), e gera as faturas daquele tenant. Erros caem
 * em nack → retry limitado → DLQ, igual ao worker de faturas.
 */
export async function initBillingWorker() {
  const channel = rabbitMQ.getChannel();

  await assertBillingQueueTopology(channel);

  channel.prefetch(1);

  console.log(`👂 Consumindo fila: ${BILLING_QUEUE}`);

  channel.consume(
    BILLING_QUEUE,
    async (msg) => {
      if (!msg) return;

      const deliveryCount = Number(msg.properties.headers?.['x-delivery-count'] ?? 0);

      try {
        const job: BillingJob = JSON.parse(msg.content.toString());

        if (!job.tenantId) {
          console.error('❌ Job de cobrança sem tenantId, descartado');
          channel.ack(msg);
          return;
        }

        console.log(`📩 Cobrança recorrente do tenant: ${job.tenantId}`);

        const result = await scheduler.processTenant(job.tenantId);

        console.log(
          `✅ Tenant ${job.tenantId}: ${result.geradas} gerada(s), ${result.ignoradas} ignorada(s) de ${result.processadas} assinatura(s).`
        );

        channel.ack(msg);
      } catch (err) {
        console.error(
          `❌ erro billing worker (entrega ${deliveryCount + 1}/${BILLING_DELIVERY_LIMIT + 1}):`,
          err
        );
        channel.nack(msg, false, true);
      }
    },
    { noAck: false }
  );
}
