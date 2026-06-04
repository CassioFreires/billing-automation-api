// src/worker.ts
import { rabbitMQ } from './config/rabbitmql.config.js';
import { initInvoiceWorker } from './works/invoice.worker.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 👇 evita crash silencioso
process.on('uncaughtException', (err) => {
    console.error('💥 uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('💥 unhandledRejection:', err);
});
(async () => {
    try {
        console.log('🔌 [Worker Mode] Inicializando conexões...');
        const MAX_TENTATIVAS = 15;
        let tentativas = 0;
        // 🔁 retry conexão RabbitMQ
        while (!rabbitMQ.isConnected && tentativas < MAX_TENTATIVAS) {
            try {
                tentativas++;
                console.log(`⏳ Tentativa ${tentativas}/${MAX_TENTATIVAS} de conexão com RabbitMQ...`);
                await rabbitMQ.connect();
                console.log('✅ RabbitMQ conectado com sucesso.');
            }
            catch (error) {
                console.error(`❌ Falha na tentativa ${tentativas}/${MAX_TENTATIVAS}:`, error);
                if (tentativas >= MAX_TENTATIVAS) {
                    throw new Error('Não foi possível conectar ao RabbitMQ após várias tentativas.');
                }
                await sleep(3000);
            }
        }
        if (!rabbitMQ.isConnected) {
            throw new Error('RabbitMQ não está conectado.');
        }
        console.log('🚀 Iniciando consumidor da fila...');
        await initInvoiceWorker();
        console.log('✅ Worker iniciado com sucesso e aguardando mensagens.');
        // 🚨 ESSENCIAL: mantém processo vivo
        // (o consumer do RabbitMQ mantém o event loop ativo)
        // mas isso evita edge cases em containers
        setInterval(() => {
            console.log('🟢 Worker alive...');
        }, 60000);
    }
    catch (error) {
        console.error('❌ Falha crítica no processo do Worker:', error);
        process.exit(1);
    }
})();
