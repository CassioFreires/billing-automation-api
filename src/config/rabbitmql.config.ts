import amqp, {
  Channel,
  ChannelModel
} from 'amqplib';

class RabbitMQConfig {

  private connection: ChannelModel | null = null;
  private _channel: Channel | null = null;

  async connect(): Promise<void> {
    try {

      this.connection = await amqp.connect(
        process.env.RABBITMQ_URL!
      );

      this._channel =
        await this.connection.createChannel();

      console.log(
        '🔌 [RabbitMQ] Conectado com sucesso.'
      );

    } catch (error) {

      console.error(
        '❌ [RabbitMQ] Erro ao conectar:',
        error
      );

      throw error;
    }
  }

  get channel(): Channel {

    if (!this._channel) {

      throw new Error(
        'Canal RabbitMQ não inicializado.'
      );

    }

    return this._channel;
  }

  get isConnected(): boolean {

    return (
      this.connection !== null &&
      this._channel !== null
    );

  }
}

export const rabbitMQ =
  new RabbitMQConfig();