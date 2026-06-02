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
      include: { client: true } // Já traz os dados do cliente junto se precisar
    });
  }

  async updateStatus(id: string, status: string, paidAt?: Date) {
    return prisma.invoice.update({
      where: { id },
      data: { status, paidAt }
    });
  }

  async findPendingInvoices() {
    return prisma.invoice.findMany({
      where: { status: "PENDING" },
      include: { client: true }
    });
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