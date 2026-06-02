import { NotificationService } from '../services/notication.service.js';
export class NotificationController {
    notificationService;
    constructor() {
        this.notificationService = new NotificationService();
    }
    async triggerOverdueNotifications(req, res) {
        try {
            let overdueInvoices = req.body;
            if (overdueInvoices && !Array.isArray(overdueInvoices) && typeof overdueInvoices === 'object') {
                overdueInvoices = [overdueInvoices];
            }
            // Validação básica de entrada
            if (!Array.isArray(overdueInvoices) || overdueInvoices.length === 0) {
                return res.status(400).json({ error: 'O corpo da requisição deve ser um array de faturas.' });
            }
            // Apenas despacha para a fila do RabbitMQ
            const result = await this.notificationService.queueOverdueInvoices(overdueInvoices);
            // Retorna 202 (Accepted) -> Significa "Recebi, vou processar em background"
            return res.status(202).json({
                message: 'Faturas recebidas e enviadas para a fila de processamento.',
                totalEnqueued: result.enqueued
            });
        }
        catch (error) {
            console.error('❌ Erro no Controller de Notificação:', error);
            return res.status(500).json({ error: 'Erro interno ao enfileirar notificações.' });
        }
    }
}
