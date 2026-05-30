import { ClientRepository } from '../repositories/cliente.repositorie.js';
export class NotificationService {
    clientRepository;
    constructor() {
        this.clientRepository = new ClientRepository();
    }
    async execute(data) {
        // Busca no repositório padronizado
        const client = await this.clientRepository.findByPhone(data.phone);
        if (!client) {
            throw new Error("Cliente não cadastrado no banco de dados do SaaS.");
        }
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || '';
        const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetPhone: data.phone,
                messagePayload: `Olá, ${data.clientName}. Constatamos uma pendência em aberto.`
            })
        });
        return response.ok;
    }
}
