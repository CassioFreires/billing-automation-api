import express from 'express';
import cors from 'cors';
import prisma from './src/database/prisma.js';
import { rabbitMQ } from './src/config/rabbitmql.config.js';
import { initInvoiceWorker } from './src/works/invoice.worker.js';
import { retry } from './src/infrastructure/retry.js';
import { appRouter } from './index.js';

const app = express();

app.use(express.json());
app.use(cors());

app.use('/api', appRouter);

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    // 🔥 API sobe primeiro (não depende de nada)
    app.listen(PORT, () => {
      console.log(`🚀 API rodando na porta ${PORT}`);
    });

    // 🧠 PostgreSQL com retry
    console.log('🔄 Conectando ao banco...');

    await retry(async () => {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    }, {
      retries: 15,
      delayMs: 2000,
      onRetry: (err, attempt) => {
        console.log(`⏳ Banco tentativa ${attempt}`);
      }
    });

    console.log('✅ Banco conectado');

    // 🐰 RabbitMQ com retry
    console.log('🔄 Conectando RabbitMQ...');

    await retry(async () => {
      await rabbitMQ.connect();
    }, {
      retries: 15,
      delayMs: 2000,
      onRetry: (err, attempt) => {
        console.log(`⏳ RabbitMQ tentativa ${attempt}`);
      }
    });

    console.log('✅ RabbitMQ conectado');

    // 👷 Worker só inicia depois de tudo OK
    await initInvoiceWorker();

    console.log('✅ Worker iniciado');

  } catch (error) {
    console.error('❌ Erro fatal no bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();