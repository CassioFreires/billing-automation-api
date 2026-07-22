/**
 * Canais de envio de cobrança (spec 0032). Fonte única das opções de canal e
 * da REGRA de resolução (qual transporte usar por fatura), no mesmo padrão de
 * `domain/regua.ts` — lógica pura e testável, sem I/O.
 *
 * Preferência do tenant (`NotifyChannel`):
 *   - 'whatsapp' → só WhatsApp
 *   - 'email'    → só e-mail; sem e-mail no cliente, FALLBACK para WhatsApp
 *   - 'both'     → WhatsApp + e-mail (o e-mail só entra se o cliente tiver um)
 *
 * O telefone é obrigatório no cliente (Client.phone NOT NULL), então o WhatsApp
 * é sempre um destino disponível — por isso ele é o alvo natural do fallback.
 */

export const NOTIFY_CHANNELS = ['whatsapp', 'email', 'both'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** Canal físico de entrega (o que o worker realmente dispara). */
export type DeliveryChannel = 'whatsapp' | 'email';

export const DEFAULT_NOTIFY_CHANNEL: NotifyChannel = 'whatsapp';

/**
 * Resolve os canais de entrega para uma fatura, na ordem de disparo.
 * `hasEmail` = o cliente tem um e-mail cadastrado.
 */
export function resolveChannels(
  preferred: NotifyChannel,
  contact: { hasEmail: boolean }
): DeliveryChannel[] {
  switch (preferred) {
    case 'email':
      // Sem e-mail → não deixa de cobrar: cai no WhatsApp (fallback).
      return contact.hasEmail ? ['email'] : ['whatsapp'];
    case 'both':
      return contact.hasEmail ? ['whatsapp', 'email'] : ['whatsapp'];
    case 'whatsapp':
    default:
      return ['whatsapp'];
  }
}
