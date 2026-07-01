import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import prisma from './database/prisma.js';
import { rabbitMQ } from './config/rabbitmql.config.js';
import { connectRedis } from './config/redis.config.js';
import { initInvoiceWorker } from './works/invoice.worker.js';
import { retry } from './infrastructure/retry.js';
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
     * Worker
     *
     * ⚠️ D-03 (SDD/context/tech-debt.md): hoje o worker sobe junto com a API.
     * Para escalar de forma independente, mover para o processo isolado
     * `src/worker.ts` e remover esta chamada.
     */
    console.log('🔄 Inicializando worker...');
    await initInvoiceWorker();
    console.log('✅ Worker iniciado');

    /**
     * API
     */
    app.listen(PORT, () => {
      console.log(`🚀 API rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erro fatal no bootstrap');
    console.error(error);
    process.exit(1);
  }
}

bootstrap();
