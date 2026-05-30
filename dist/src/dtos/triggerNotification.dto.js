export function validateTriggerNotification(payload) {
    if (!payload.phone || typeof payload.phone !== 'string' || payload.phone.length < 10) {
        throw new Error("Formato de telefone/WhatsApp inválido.");
    }
    if (!payload.clientName || typeof payload.clientName !== 'string') {
        throw new Error("O nome do cliente é obrigatório para a parametrização.");
    }
    return {
        phone: payload.phone,
        clientName: payload.clientName
    };
}
