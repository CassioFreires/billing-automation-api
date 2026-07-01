import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';
import { requireTenantId } from '../context/tenant-context.js';
import { CreateClientDTO } from '../dtos/createClient.dto.js';

export class ClientRepository {

  async create(data: CreateClientDTO) {
    return prisma.client.create({
      data: {
        ...data,
        tenantId: requireTenantId(),
      }
    });
  }

  async findAll() {
    return prisma.client.findMany({
      where: { tenantId: requireTenantId() }
    });
  }

  async findById(id: string) {
    return prisma.client.findFirst({
      where: {
        id,
        tenantId: requireTenantId()
      }
    });
  }

  async findByPhone(phone: string) {
    return prisma.client.findUnique({
      where: {
        tenantId_phone: {
          tenantId: requireTenantId(),
          phone
        }
      }
    });
  }

  async update(
    id: string,
    data: Prisma.ClientUpdateInput
  ) {
    // Escopo garantido pelo service (findById por tenant antes de atualizar).
    return prisma.client.update({
      where: {
        id
      },
      data
    });
  }

  async delete(id: string) {
    // Escopo garantido pelo service (findById por tenant antes de remover).
    return prisma.client.delete({
      where: {
        id
      }
    });
  }
}
