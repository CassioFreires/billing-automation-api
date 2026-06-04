// src/worker.ts
import { rabbitMQ } from './config/rabbitmql.config.js';
import { initInvoiceWorker } from './works/invoice.worker.js';

(async () => {
  try {
    console.log('🔌 [Worker Mode] Inicializando conexões...');

    // 1. Força a inicialização da conexão com o RabbitMQ se o seu arquivo de config tiver um método connect.
    // Se a sua classe conecta automaticamente ao ser importada, o loop abaixo garante a espera.
    
    let tentativas = 0;
    while (!rabbitMQ.channel && tentativas < 15) {
      console.log('⏳ Aguardando conexão com o RabbitMQ...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      tentativas++;
    }

    if (!rabbitMQ.channel) {
      throw new Error('Não foi possível obter o canal do RabbitMQ.');
    }

    // 2. Inicia o consumo da fila
    await initInvoiceWorker();
    console.log('🚀 Worker rodando com sucesso e aguardando mensagens.');

  } catch (error) {
    console.error('❌ Falha crítica no processo do Worker isolado:', error);
    process.exit(1);
  }
})();