import { CreateInvoiceDTO } from '../dtos/createInvoice.dto.js';
import prisma from '../database/prisma.js';
import { redis } from '../config/redis.config.js';

export class InvoiceRepository {

  async create(
    data: CreateInvoiceDTO & {
      pixCopyPaste?: string;
      gatewayId?: string;
    }
  ) {

    const invoice = await prisma.invoice.create({
      data: {
        clientId: data.clientId,
        value: data.value,
        dueDate: data.dueDate,
        pixCopyPaste: data.pixCopyPaste,
        gatewayId: data.gatewayId,
        status: 'PENDING'
      }
    });

    return invoice;
  }

  async findByGatewayId(gatewayId: string) {

    return prisma.invoice.findUnique({
      where: { gatewayId },
      include: { client: true }
    });

  }

  async findNotificationDataById(id: string) {
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
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

    const cacheKey = `pending-invoices:${page}:${limit}`;

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

  async updateNotificationData(
    id: string,
    gatewayId: string,
    pixCopyPaste: string
  ) {

    const result = await prisma.invoice.update({
      where: { id },
      data: {
        gatewayId,
        pixCopyPaste,
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