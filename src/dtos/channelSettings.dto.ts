import { z } from 'zod';
import { NOTIFY_CHANNELS } from '../domain/channels.js';

/**
 * Configuração de canal de envio por tenant (spec 0032).
 * `channel`: whatsapp (padrão) | email | both.
 */
export const updateChannelSettingsSchema = z.object({
  channel: z.enum(NOTIFY_CHANNELS),
});

export type UpdateChannelSettingsDTO = z.infer<typeof updateChannelSettingsSchema>;

export function validateUpdateChannelSettings(payload: unknown): UpdateChannelSettingsDTO {
  return updateChannelSettingsSchema.parse(payload);
}
