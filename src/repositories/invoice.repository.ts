import prisma from '../database/prisma.js';
import { redis } from '../config/redis.config.js';
import { requireTenantId } from '../context/tenant-context.js';

export class InvoiceRepository {

  async create(
    data: {
      clientId: string;
      value: number;
      dueDate: Date;
      items?: { description: string; quantity: number; unitPrice: number }[];
      pixCopyPaste?: string;
      pixQrCode?: string;
      checkoutUrl?: string;
      gatewayId?: string;
    }
  ) {

    const invoice = await prisma.invoice.create({
      data: {
        clientId: data.clientId,
        value: data.value,
        dueDate: data.dueDate,
        pixCopyPaste: data.pixCopyPaste,
        pixQrCode: data.pixQrCode,
        checkoutUrl: data.checkoutUrl,
        gatewayId: data.gatewayId,
        status: 'PENDING',
        tenantId: requireTenantId(),
        items:
          data.items && data.items.length
            ? {
                create: data.items.map((i) => ({
                  description: i.description,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                })),
              }
            : undefined,
      },
      include: { items: true },
    });

    return invoice;
  }

  async findByClientId(clientId: string) {
    return prisma.invoice.findMany({
      where: {
        clientId,
        tenantId: requireTenantId(),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Busca UMA fatura do tenant atual (com dados do cliente e itens). null se não existir. */
  async findById(id: string) {
    return prisma.invoice.findFirst({
      where: {
        id,
        tenantId: requireTenantId(),
      },
      include: {
        client: {
          select: { id: true, name: true, phone: true, document: true, status: true },
        },
        items: true,
      },
    });
  }

  /** Lista TODAS as faturas do tenant, paginadas, com filtro opcional por status. */
  async findAll(page: number = 1, limit: number = 10, status?: string) {
    const tenantId = requireTenantId();
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(status ? { status } : {}),
    };

    const [invoices, totalItems] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, phone: true, document: true, status: true },
          },
          items: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      meta: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    };
  }

  async findByGatewayId(gatewayId: string) {

    return prisma.invoice.findUnique({
      where: { gatewayId },
      include: { client: true }
    });

  }

  async findNotificationDataById(id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        tenantId: requireTenantId(),
      },
      include: {
        client: true,
      },
    });

    if (!invoice) {
      return null;
    }

    return {
      id: invoice.id,
      value: invoice.value,
      dueDate: invoice.dueDate,
      phone: invoice.client.phone,
      document: invoice.client.document,
      clientName: invoice.client.name,
      pixCopyPaste: invoice.pixCopyPaste,
      checkoutUrl: invoice.checkoutUrl,
      gatewayId: invoice.gatewayId,
    };
  }

  async updateStatus(
    id: string,
    status: string,
    paidAt?: Date
  ) {

    const result = await prisma.invoice.update({
      where: { id },
      data: { status, paidAt }
    });

    await this.clearPendingInvoicesCache();

    return result;
  }

  async findPendingInvoices(
    page: number = 1,
    limit: number = 10
  ) {

    const tenantId = requireTenantId();
    const cacheKey = `pending-invoices:${tenantId}:${page}:${limit}`;

    /**
     * CACHE READ
     */
    try {

      if (redis?.isOpen) {

        const cachedData =
          await redis.get(cacheKey);

        if (cachedData) {

          console.log('🧠 CACHE HIT');

          return JSON.parse(cachedData);
        }

        console.log('❌ CACHE MISS');
      }

    } catch (error) {

      console.error(
        'Erro ao buscar cache:',
        error
      );

    }

    /**
     * DATABASE
     */
    const skip = (page - 1) * limit;

    const [invoices, totalItems] =
      await prisma.$transaction([
        prisma.invoice.findMany({
          where: {
            tenantId,
            status: 'PENDING',
            client: {
              status: 'EM_ATRASO'
            }
          },
          skip,
          take: limit,
          select: {
            id: true,
            value: true,
            status: true,
            dueDate: true,
            notificationSent: true,
            paidAt: true,
            gatewayId: true,
            client: {
              select: {
                name: true,
                phone: true,
                document: true,
                status: true,
                processed: true
              }
            }
          },
          orderBy: {
            dueDate: 'asc'
          }
        }),
        prisma.invoice.count({
          where: {
            tenantId, // BUGFIX: sem isso o total contava faturas de TODOS os tenants
            status: 'PENDING',
            client: {
              status: 'EM_ATRASO'
            }
          }
        })
      ]);

    const result = {
      invoices,
      meta: {
        totalItems,
        totalPages: Math.ceil(
          totalItems / limit
        ),
        currentPage: page,
        limit
      }
    };

    /**
     * CACHE WRITE
     */
    try {

      if (redis?.isOpen) {

        await redis.set(
          cacheKey,
          JSON.stringify(result),
          {
            EX: 60
          }
        );

      }

    } catch (error) {

      console.error(
        'Erro ao salvar cache:',
        error
      );

    }

    return result;
  }

  /**
   * Marca a fatura como notificada. NÃO sobrescreve os dados de pagamento
   * (gatewayId/PIX/checkout) — esses vêm do gateway na criação da cobrança.
   */
  async markNotificationSent(id: string) {

    const result = await prisma.invoice.update({
      where: { id },
      data: {
        notificationSent: true
      }
    });

    await this.clearPendingInvoicesCache();

    return result;
  }

  async clearPendingInvoicesCache() {

    try {

      if (!redis?.isOpen) {
        return;
      }

      const keys = await redis.keys(
        'pending-invoices:*'
      );

      if (keys.length > 0) {
        await redis.del(keys);
      }

    } catch (error) {

      console.error(
        'Erro ao limpar cache:',
        error
      );

    }
  }

}