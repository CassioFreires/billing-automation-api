import amqp from 'amqplib';
class RabbitMQConfig {
    connection = null;
    _channel = null;
    async connect() {
        try {
            this.connection = await amqp.connect(process.env.RABBITMQ_URL);
            this._channel =
                await this.connection.createChannel();
            console.log('🔌 [RabbitMQ] Conectado com sucesso.');
        }
        catch (error) {
            console.error('❌ [RabbitMQ] Erro ao conectar:', error);
            throw error;
        }
    }
    get channel() {
        if (!this._channel) {
            throw new Error('Canal RabbitMQ não inicializado.');
        }
        return this._channel;
    }
    get isConnected() {
        return (this.connection !== null &&
            this._channel !== null);
    }
}
export const rabbitMQ = new RabbitMQConfig();
