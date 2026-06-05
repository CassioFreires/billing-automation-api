// src/config/rabbitmql.config.ts
import amqp, { Channel, ChannelModel } from 'amqplib';

class RabbitMQConfig {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  async connect(): Promise<void> {
    this.connection = await amqp.connect(process.env.RABBITMQ_URL!);

    this.connection.on('error', (err) => {
      console.error('❌ RabbitMQ connection error:', err);
    });

    this.connection.on('close', () => {
      console.error('⚠️ RabbitMQ connection closed');
      this.connection = null;
      this.channel = null;
    });

    this.channel = await this.connection.createChannel();

    this.channel.on('error', (err) => {
      console.error('❌ RabbitMQ channel error:', err);
    });

    this.channel.on('close', () => {
      console.error('⚠️ RabbitMQ channel closed');
    });

    console.log('🔌 RabbitMQ conectado com sucesso');
  }

  getChannel(): Channel {
    if (!this.channel || !this.connection) {
      throw new Error('RabbitMQ não conectado');
    }
    return this.channel;
  }

  isConnected(): boolean {
    return !!this.connection && !!this.channel;
  }
}

export const rabbitMQ = new RabbitMQConfig();