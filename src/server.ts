import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import prisma from './database/prisma.js';
import { rabbitMQ } from './config/rabbitmql.config.js';
import { connectRedis, disconnectRedis } from './config/redis.config.js';
import { initInvoiceWorker } from './works/invoice.worker.js';
import { initBillingWorker } from './works/billing.worker.js';
import { assertInvoiceQueueTopology } from './messaging/invoice-queue.js';
import { assertBillingQueueTopology } from './messaging/billing-scheduler-queue.js';
import { retry } from './infrastructure/retry.js';
import { serializeDecimal } from './middlewares/serialize-decimal.middleware.js';
import { appRouter } from './index.js';

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION');
  console.error(err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION');
  console.error(err);
});

const app = express();

app.use(express.json());
app.use(cors());
app.use(serializeDecimal); // Decimal → number na saída (mantém contrato da API)

app.use('/api', appRouter);

/**
 * Health Check (raiz — além de /api/health via router)
 */
app.get('/health', (_, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
  });
});

const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  try {
    /**
     * PostgreSQL
     */
    console.log('🔄 Conectando ao banco...');
    await retry(
      async () => {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      },
      {
        retries: 15,
        delayMs: 2000,
        onRetry: (_, attempt) => {
          console.log(`⏳ Banco tentativa ${attempt}`);
        },
      }
    );
    console.log('✅ Banco conectado');

    /**
     * Redis (Opcional)
     */
    if (process.env.REDIS_ENABLED === 'true') {
      try {
        console.log('🔄 Conectando Redis...');
        await retry(
          async () => {
            await connectRedis();
          },
          {
            retries: 15,
            delayMs: 2000,
            onRetry: (_, attempt) => {
              console.log(`⏳ Redis tentativa ${attempt}`);
            },
          }
        );
        console.log('🧠 Redis conectado');
      } catch (error) {
        console.warn('⚠️ Redis indisponível. Aplicação continuará sem cache.');
        console.error(error);
      }
    } else {
      console.log('⚠️ Redis desabilitado');
    }

    /**
     * RabbitMQ
     */
    console.log('🔄 Conectando RabbitMQ...');
    await retry(
      async () => {
        await rabbitMQ.connect();
      },
      {
        retries: 15,
        delayMs: 2000,
        onRetry: (_, attempt) => {
          console.log(`⏳ RabbitMQ tentativa ${attempt}`);
        },
      }
    );
    console.log('✅ RabbitMQ conectado');

    /**
     * Topologia da fila (DLX/DLQ/limite de entregas).
     * A API precisa dela para publicar, independentemente de rodar o worker.
     */
    await assertInvoiceQueueTopology(rabbitMQ.getChannel());
    await assertBillingQueueTopology(rabbitMQ.getChannel());
    console.log('✅ Topologia das filas garantida');

    /**
     * Worker (D-03)
     *
     * Por padrão a API também consome a fila (monólito, simples de operar).
     * Numa topologia com worker isolado (`npm run worker`), defina
     * `RUN_WORKER_INLINE=false` na API para evitar consumidor duplicado.
     */
    const runWorkerInline = process.env.RUN_WORKER_INLINE !== 'false';

    if (runWorkerInline) {
      console.log('🔄 Inicializando workers (inline na API)...');
      await initInvoiceWorker();
      await initBillingWorker();
      console.log('✅ Workers iniciados (inline)');
    } else {
      console.log(
        'ℹ️ Worker inline desabilitado (RUN_WORKER_INLINE=false). Rode `npm run worker` em separado.'
      );
    }

    /**
     * API
     */
    const server = app.listen(PORT, () => {
      console.log(`🚀 API rodando na porta ${PORT}`);
    });

    /**
     * Graceful shutdown: fecha HTTP → RabbitMQ → Redis → Prisma.
     * Acionado por SIGTERM (docker stop / rollout) e SIGINT (Ctrl+C).
     */
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`↩️ ${signal} recebido — encerrando graciosamente...`);

      const timer = setTimeout(() => {
        console.error('⏱️ Shutdown demorou demais, forçando saída');
        process.exit(1);
      }, 25000);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rabbitMQ.close();
      await disconnectRedis();
      await prisma.$disconnect();

      clearTimeout(timer);
      console.log('✅ Encerrado');
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Erro fatal no bootstrap');
    console.error(error);
    process.exit(1);
  }
}

bootstrap();
