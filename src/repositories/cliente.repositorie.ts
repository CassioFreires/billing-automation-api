import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';
import { requireTenantId } from '../context/tenant-context.js';
import { CreateClientDTO } from '../dtos/createClient.dto.js';
import { ImportClientRowDTO } from '../dtos/importClients.dto.js';

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

  /**
   * Upsert em lote por telefone (spec 0008). Idempotente: rodar duas vezes
   * o mesmo arquivo não duplica clientes. Retorna a contagem por resultado.
   * Duplicatas de telefone DENTRO do mesmo lote são resolvidas mantendo a
   * ÚLTIMA ocorrência; as anteriores contam como `ignorados`.
   */
  async importUpsert(rows: ImportClientRowDTO[]) {
    const tenantId = requireTenantId();

    // Dedup interno do lote: última ocorrência de cada telefone vence.
    const byPhone = new Map<string, ImportClientRowDTO>();
    let ignorados = 0;
    for (const row of rows) {
      if (byPhone.has(row.phone)) {
        ignorados++;
      }
      byPhone.set(row.phone, row);
    }

    let criados = 0;
    let atualizados = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of byPhone.values()) {
        const existing = await tx.client.findUnique({
          where: { tenantId_phone: { tenantId, phone: row.phone } },
          select: { id: true },
        });

        if (existing) {
          await tx.client.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              document: row.document,
              ...(row.status ? { status: row.status } : {}),
            },
          });
          atualizados++;
        } else {
          await tx.client.create({
            data: {
              name: row.name,
              phone: row.phone,
              document: row.document,
              ...(row.status ? { status: row.status } : {}),
              tenantId,
            },
          });
          criados++;
        }
      }
    });

    return { criados, atualizados, ignorados };
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

  /**
   * Anonimiza o titular (LGPD — spec 0004): remove os dados pessoais mas
   * mantém o registro (e suas faturas) para retenção legal. Escopo garantido
   * pelo service (findById por tenant antes de anonimizar).
   */
  async anonymize(id: string) {
    return prisma.client.update({
      where: { id },
      data: {
        name: 'Titular anonimizado (LGPD)',
        phone: `anon-${id}`, // placeholder único por tenant (RN-L3)
        document: 'ANONIMIZADO',
        anonymizedAt: new Date()
      }
    });
  }
}
