import prisma from '../database/prisma.js';
export class InvoiceRepository {
    async create(data) {
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
    async findByGatewayId(gatewayId) {
        return prisma.invoice.findUnique({
            where: { gatewayId },
            include: { client: true } // Já traz os dados do cliente junto se precisar
        });
    }
    async updateStatus(id, status, paidAt) {
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
    async updateNotificationData(id, gatewayId, pixCopyPaste) {
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
