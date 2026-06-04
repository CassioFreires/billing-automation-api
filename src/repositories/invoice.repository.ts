import { CreateInvoiceDTO } from '../dtos/createInvoice.dto.js';
import prisma from '../database/prisma.js';

export class InvoiceRepository {
  async create(data: CreateInvoiceDTO & { pixCopyPaste?: string; gatewayId?: string }) {
    return prisma.invoice.create({
      data: {
        clientId: data.clientId,
        value: data.value,
        dueDate: data.dueDate,
        pixCopyPaste: data.pixCopyPaste,
        gatewayId: data.gatewayId,
        status: "PENDING"
      }
    });
  }

  async findByGatewayId(gatewayId: string) {
    return prisma.invoice.findUnique({
      where: { gatewayId },
      include: { client: true }
    });
  }

  async updateStatus(id: string, status: string, paidAt?: Date) {
    return prisma.invoice.update({
      where: { id },
      data: { status, paidAt }
    });
  }

  // MÉTODO OTIMIZADO: Selecionando apenas os campos cirúrgicos
  async findPendingInvoices(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    // Executa a busca e a contagem em paralelo para otimizar a performance
    const [invoices, totalItems] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: {
          status: "PENDING",
          client: { status: 'EM_ATRASO' }
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
          dueDate: 'asc' // Organiza pelas mais urgentes (vencidas há mais tempo)
        }
      }),
      prisma.invoice.count({
        where: {
          status: "PENDING",
          client: { status: 'EM_ATRASO' }
        }
      })
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      invoices,
      meta: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    };
  }
  async updateNotificationData(
    id: string,
    gatewayId: string,
    pixCopyPaste: string
  ) {
    return prisma.invoice.update({
      where: { id },
      data: {
        gatewayId,
        pixCopyPaste,
        notificationSent: true
      }
    });
  }
}