export interface TriggerNotificationDTO {
  id: string;
  status?: string;
  document: string;
  phone: string;
  clientName: string;
  debtValue?: number;
  value?:number;
}

export function validateTriggerNotification(
  payload: any
): TriggerNotificationDTO {
  console.log(payload)
  if (!payload.id || typeof payload.id !== 'string') {
    throw new Error('O ID é obrigatório.');
  }

  if (!payload.status || typeof payload.status !== 'string') {
    throw new Error('O status é obrigatório.');
  }

  if (!payload.document || typeof payload.document !== 'string') {
    throw new Error('O documento é obrigatório.');
  }

  if (
    !payload.phone ||
    typeof payload.phone !== 'string' ||
    payload.phone.replace(/\D/g, '').length < 10
  ) {
    throw new Error('Formato de telefone/WhatsApp inválido.');
  }

  if (
    !payload.clientName ||
    typeof payload.clientName !== 'string'
  ) {
    throw new Error(
      'O nome do cliente é obrigatório para a parametrização.'
    );
  }

  return {
    id: payload.id,
    status: payload.status,
    document: payload.document,
    phone: payload.phone,
    clientName: payload.clientName,
    debtValue: payload.debtValue ? Number(payload.debtValue) : undefined,
    value: payload.value ? Number(payload.value) : undefined
  };
}