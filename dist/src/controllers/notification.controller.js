import { validateTriggerNotification } from '../dtos/triggerNotification.dto.js';
import { NotificationService } from '../services/notication.service.js';
export class NotificationController {
    async trigger(req, res) {
        try {
            // Validação pelo DTO com nome corrigido
            const validatedData = validateTriggerNotification(req.body);
            const service = new NotificationService();
            const isDispatched = await service.execute(validatedData);
            if (isDispatched) {
                return res.status(200).json({ message: "Gatilho enviado com sucesso." });
            }
            return res.status(500).json({ error: "Falha ao processar disparo no n8n." });
        }
        catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }
}
