// src/worker.ts
import 'dotenv/config';
import { rabbitMQ } from './config/rabbitmql.config.js';
import { initInvoiceWorker } from './works/invoice.worker.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

process.on('uncaughtException', (err) => {
  console.error('💥 uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 unhandledRejection:', err);
});

async function bootstrapWorker() {
  console.log('🔌 Worker iniciando...');

  const MAX_RETRIES = 20;

  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      console.log(`⏳ Conectando RabbitMQ (${i}/${MAX_RETRIES})...`);

      await rabbitMQ.connect();

      console.log('✅ RabbitMQ conectado');
      break;
    } catch (err) {
      console.error(`❌ Falha tentativa ${i}`, err);
      await sleep(3000);
    }
  }

  if (!rabbitMQ.isConnected()) {
    throw new Error('RabbitMQ não conectou');
  }

  await initInvoiceWorker();

  console.log('👂 Worker rodando e consumindo fila');

  // mantém container vivo (Swarm-safe)
  setInterval(() => {
    console.log('🟢 Worker alive');
  }, 60000);
}

bootstrapWorker().catch((err) => {
  console.error('💥 Worker fatal:', err);
  process.exit(1);
});