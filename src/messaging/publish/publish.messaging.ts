import { rabbitMQ } from '../../config/rabbitmql.config.js';

export async function publishRabbitMql(queue: string, msg: string): Promise<void> {
  const channel = rabbitMQ.channel;

  // Garante a fila resiliente (caderno de couro)
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum'
    }
  });

  // Envia a mensagem persistente (caneta permanente)
  channel.sendToQueue(queue, Buffer.from(msg), { persistent: true });
  console.log(" [x] Sent '%s' to queue '%s'", msg, queue);
}