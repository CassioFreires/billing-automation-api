import prisma from '../database/prisma.js';
import { redis } from '../config/redis.config.js';
export class InvoiceRepository {
    async create(data) {
        const invoice = await prisma.invoice.create({
            data: {
                clientId: data.clientId,
                value: data.value,
                dueDate: data.dueDate,
                pixCopyPaste: data.pixCopyPaste,
                gatewayId: data.gatewayId,
                status: "PENDING"
            }
        });
        // 🔥 invalida cache de listas pendentes
        await this.invalidatePendingCache();
        return invoice;
    }
    async findByGatewayId(gatewayId) {
        const key = `invoice:gateway:${gatewayId}`;
        // 🔥 1. tenta cache
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        // 🔥 2. DB
        const invoice = await prisma.invoice.findUnique({
            where: { gatewayId },
            include: { client: true }
        });
        // 🔥 3. salva cache
        if (invoice) {
            await redis.set(key, JSON.stringify(invoice), {
                EX: 60 * 10 // 10 min
            });
        }
        return invoice;
    }
    async updateStatus(id, status, paidAt) {
        const result = await prisma.invoice.update({
            where: { id },
            data: { status, paidAt }
        });
        // 🔥 invalida cache individual
        if (result.gatewayId) {
            await redis.del(`invoice:gateway:${result.gatewayId}`);
        }
        // 🔥 invalida listas
        await this.invalidatePendingCache();
        return result;
    }
    async findPendingInvoices(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const key = `invoices:pending:${page}:${limit}`;
        // 🔥 1. cache
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        // 🔥 2. DB
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
                    status: "PENDING",
                    client: { status: 'EM_ATRASO' }
                }
            })
        ]);
        const result = {
            invoices,
            meta: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        };
        // 🔥 3. salva cache
        await redis.set(key, JSON.stringify(result), {
            EX: 120 // 2 min
        });
        return result;
    }
    async updateNotificationData(id, gatewayId, pixCopyPaste) {
        const result = await prisma.invoice.update({
            where: { id },
            data: {
                gatewayId,
                pixCopyPaste,
                notificationSent: true
            }
        });
        // 🔥 invalida cache individual
        await redis.del(`invoice:gateway:${gatewayId}`);
        // 🔥 invalida listas
        await this.invalidatePendingCache();
        return result;
    }
    // =========================
    // 🔥 HELPERS DE CACHE
    // =========================
    async invalidatePendingCache() {
        const keys = await redis.keys('invoices:pending:*');
        if (keys.length > 0) {
            await redis.del(keys);
        }
    }
}
