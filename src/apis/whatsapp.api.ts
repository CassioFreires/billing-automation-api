import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';

export class WhatsappAPI {

    sendMessageWhatsapp(data: TriggerNotificationDTO, messagem: {targetPhone: string, messagePayload: string}): {targetPhone: string, messagePayload: string} {
        return {
                targetPhone: messagem.targetPhone,
                messagePayload: messagem.messagePayload
        }
    }

}