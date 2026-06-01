export class WhatsappAPI {
    sendMessageWhatsapp(data, messagem) {
        return {
            targetPhone: messagem.targetPhone,
            messagePayload: messagem.messagePayload
        };
    }
}
