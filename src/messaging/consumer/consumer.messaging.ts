import { rabbitMQ } from '../../config/rabbitmql.config.js';

export async function initRabbitConsumers(): Promise<void> {
  const channel = rabbitMQ.getChannel();
  const queue = 'task_queue'; // Ou pegue por parâmetro

  await channel.assertQueue(queue, {
    durable: true,
    arguments: { 'x-queue-type': 'quorum' }
  });

  // Despacho justo: um por vez por worker
  channel.prefetch(1);

  console.log(" 👣 [Worker] Aguardando mensagens em %s.", queue);

  channel.consume(queue, async (msg:any) => {
    if (!msg) return;

    try {
      const conteudo = msg.content.toString();
      console.log(" [x] Processando tarefa recebida: %s", conteudo);

      // --- AQUI ENTRA A SUA LÓGICA DE NEGÓCIO DO PROJETO ---
      // Exemplo: const dados = JSON.parse(conteudo);
      // await notificationService.triggerNotification(dados);

      // Confirmação Manual: Só dá o ACK se tudo deu certo!
      channel.ack(msg);
      console.log(" [x] Tarefa concluída com sucesso!");
    } catch (error) {
      console.error(" ❌ Erro ao processar mensagem. Ela será devolvida para a fila:", error);
      // Se deu erro crítico (ex: API do WhatsApp caiu), o nack devolve ela para a fila (requeue: true)
      channel.nack(msg, false, true); 
    }
  }, { noAck: false }); // Garante o modo seguro de confirmação
}