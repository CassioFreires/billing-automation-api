import { randomUUID } from 'node:crypto';
import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';
import { requireTenantId } from '../context/tenant-context.js';
import { CreateClientDTO } from '../dtos/createClient.dto.js';
import { ImportClientRowDTO } from '../dtos/importClients.dto.js';
import { planImport } from '../utils/import-plan.js';

export class ClientRepository {

  async create(data: CreateClientDTO) {
    return prisma.client.create({
      data: {
        ...data,
        tenantId: requireTenantId(),
      }
    });
  }

  /**
   * Lista os clientes do tenant. Inclui a saúde (Radar de Risco, spec 0035) e
   * aceita filtro por faixa (`band`: healthy | watch | at_risk).
   */
  async findAll(band?: string) {
    return prisma.client.findMany({
      where: {
        tenantId: requireTenantId(),
        ...(band ? { health: { is: { band } } } : {}),
      },
      include: {
        health: { select: { score: true, band: true, signals: true, computedAt: true } },
      },
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
    const phones = rows.map((r) => r.phone);

    return prisma.$transaction(async (tx) => {
      // 1 leitura batch: quais telefones já existem (evita findUnique por linha).
      const existing = await tx.client.findMany({
        where: { tenantId, phone: { in: phones } },
        select: { id: true, phone: true },
      });
      const idByPhone = new Map(existing.map((e) => [e.phone, e.id]));

      // Planejamento puro (dedup + split), testado em utils/import-plan.
      const { toCreate, toUpdate, ignorados } = planImport(
        rows,
        new Set(idByPhone.keys())
      );

      // Cria todos os novos numa única query.
      if (toCreate.length) {
        await tx.client.createMany({
          data: toCreate.map((row) => ({
            name: row.name,
            phone: row.phone,
            document: row.document,
            ...(row.email ? { email: row.email } : {}),
            ...(row.status ? { status: row.status } : {}),
            tenantId,
          })),
        });
      }

      // Updates têm valores distintos por linha → um por telefone existente.
      for (const row of toUpdate) {
        await tx.client.update({
          where: { id: idByPhone.get(row.phone)! },
          data: {
            name: row.name,
            document: row.document,
            ...(row.email ? { email: row.email } : {}),
            ...(row.status ? { status: row.status } : {}),
          },
        });
      }

      return { criados: toCreate.length, atualizados: toUpdate.length, ignorados };
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

  /**
   * Resolve um cliente pelo `portalToken` (spec 0027). ENTRADA GLOBAL legítima
   * (como findByLinkToken): a rota do portal é pública e o tenant vem do cliente.
   */
  async findByPortalToken(token: string) {
    return prisma.client.findUnique({
      where: { portalToken: token },
      select: { id: true, name: true, tenantId: true, anonymizedAt: true },
    });
  }

  /**
   * Garante um portalToken para o cliente (spec 0027). Tenant-scoped (ação do
   * dono). Gera se ainda não existir e devolve o token.
   */
  async ensurePortalToken(id: string): Promise<string | null> {
    const client = await prisma.client.findFirst({
      where: { id, tenantId: requireTenantId() },
      select: { id: true, portalToken: true },
    });
    if (!client) return null;
    if (client.portalToken) return client.portalToken;
    const token = randomUUID();
    await prisma.client.update({ where: { id: client.id }, data: { portalToken: token } });
    return token;
  }

  /** Resolve vários clientes por telefone numa query (spec 0024 — import de faturas). */
  async findByPhones(phones: string[]) {
    if (phones.length === 0) return [];
    return prisma.client.findMany({
      where: { tenantId: requireTenantId(), phone: { in: phones } },
      select: { id: true, phone: true },
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
