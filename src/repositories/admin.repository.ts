import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';

/**
 * Acesso GLOBAL (cross-tenant) para o painel super-admin (spec 0023). NÃO usa
 * `requireTenantId` — é uma entrada legítima fora do escopo de tenant, como
 * `invoice.repository.findByGatewayId`. Só o admin.service (autorizado pelo
 * `requirePlatformAdmin`) chama estes métodos.
 */
export class AdminRepository {
  /** Lista de tenants (Account) com assinatura e contagens, paginada + busca. */
  async listTenants(params: { search?: string; page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Prisma.AccountWhereInput = params.search
      ? { name: { contains: params.search, mode: 'insensitive' } }
      : {};

    const [rows, total] = await prisma.$transaction([
      prisma.account.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          platformSubscription: true,
          _count: { select: { clients: true, invoices: true, users: true } },
        },
      }),
      prisma.account.count({ where }),
    ]);

    return { rows, total, page, limit };
  }

  /** Detalhe de um tenant + últimas cobranças de plataforma. */
  async getTenant(id: string) {
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        platformSubscription: true,
        _count: { select: { clients: true, invoices: true, users: true } },
        platformInvoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      },
    });
    return account;
  }

  /** Todas as assinaturas (para métricas/MRR). */
  async allSubscriptions() {
    return prisma.platformSubscription.findMany({
      select: { plan: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
    });
  }

  async setAccountStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    return prisma.account.update({ where: { id }, data: { status } });
  }

  async overrideSubscription(
    tenantId: string,
    data: { plan?: string; status?: string; currentPeriodEnd?: Date | null }
  ) {
    return prisma.platformSubscription.update({ where: { tenantId }, data });
  }

  async createAudit(data: {
    adminEmail: string;
    action: string;
    targetTenantId: string;
    meta?: Prisma.InputJsonValue;
  }) {
    return prisma.adminAuditLog.create({
      data: {
        adminEmail: data.adminEmail,
        action: data.action,
        targetTenantId: data.targetTenantId,
        meta: data.meta,
      },
    });
  }
}
