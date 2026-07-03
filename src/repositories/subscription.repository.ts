import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Acesso ao banco para assinaturas recorrentes (spec 0009).
 * Todas as consultas filtram por tenant (RN-T).
 */
export class SubscriptionRepository {
  async create(data: {
    clientId: string;
    description: string;
    amount: number;
    dayOfMonth: number;
    startDate: Date;
    nextRunDate: Date;
  }) {
    return prisma.subscription.create({
      data: {
        clientId: data.clientId,
        description: data.description,
        amount: data.amount,
        dayOfMonth: data.dayOfMonth,
        startDate: data.startDate,
        nextRunDate: data.nextRunDate,
        tenantId: requireTenantId(),
      },
      include: { client: { select: { id: true, name: true, phone: true } } },
    });
  }

  async findAll() {
    return prisma.subscription.findMany({
      where: { tenantId: requireTenantId() },
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { id: true, name: true, phone: true } } },
    });
  }

  async findById(id: string) {
    return prisma.subscription.findFirst({
      where: { id, tenantId: requireTenantId() },
      include: { client: { select: { id: true, name: true, phone: true } } },
    });
  }

  async update(id: string, data: Prisma.SubscriptionUpdateInput) {
    // Escopo garantido pelo service (findById por tenant antes de atualizar).
    return prisma.subscription.update({ where: { id }, data });
  }

  async delete(id: string) {
    // Escopo garantido pelo service. Invoices geradas ficam (FK SET NULL).
    return prisma.subscription.delete({ where: { id } });
  }

  /** Assinaturas ATIVAS do tenant com vencimento no período (nextRunDate <= now). */
  async findDueActive(now: Date) {
    return prisma.subscription.findMany({
      where: {
        tenantId: requireTenantId(),
        status: 'ACTIVE',
        nextRunDate: { lte: now },
      },
      include: { client: { select: { id: true, name: true, phone: true } } },
    });
  }

  /** Avança a próxima geração (chamado após gerar a fatura da competência). */
  async setNextRun(id: string, nextRunDate: Date) {
    return prisma.subscription.update({
      where: { id },
      data: { nextRunDate },
    });
  }
}
