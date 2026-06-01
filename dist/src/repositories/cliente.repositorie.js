import prisma from '../database/prisma.js';
export class ClientRepository {
    async create(data) {
        return prisma.client.create({
            data
        });
    }
    async findAll() {
        return prisma.client.findMany();
    }
    async findById(id) {
        return prisma.client.findUnique({
            where: {
                id
            }
        });
    }
    async findByPhone(phone) {
        return prisma.client.findUnique({
            where: {
                phone
            }
        });
    }
    async update(id, data) {
        return prisma.client.update({
            where: {
                id
            },
            data
        });
    }
    async delete(id) {
        return prisma.client.delete({
            where: {
                id
            }
        });
    }
}
