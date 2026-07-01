import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';

/**
 * Registro de eventos de webhook já processados (idempotência — RN-P3).
 * Global (não escopado por tenant): o webhook resolve o tenant pela fatura.
 */
export class WebhookEventRepository {
  /**
   * Registra o evento; retorna `true` se é novo, `false` se já existia.
   * Usa a PK única como trava de idempotência.
   */
  async recordIfNew(id: string, provider: string): Promise<boolean> {
    try {
      await prisma.webhookEvent.create({ data: { id, provider } });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false; // já processado
      }
      throw error;
    }
  }
}
