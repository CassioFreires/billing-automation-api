import prisma from '../database/prisma.js';
import { requireTenantId } from '../context/tenant-context.js';

/**
 * Acesso a contas/tenants. ATENÇÃO: diferente dos outros repositórios, aqui há
 * consultas de SISTEMA (cross-tenant) — usadas pelo agendador de cobrança
 * (spec 0010). Elas NÃO filtram por tenant de propósito e só devem ser
 * chamadas por rotas protegidas por segredo de sistema (cronAuth), nunca por
 * uma rota autenticada por JWT de um tenant.
 *
 * Os métodos com sufixo `Current` SÃO escopados ao tenant do JWT (spec 0022,
 * direitos do titular do SaaS sobre a própria conta).
 */
export class AccountRepository {
  /** IDs de todos os tenants ATIVOS. Base do fan-out do agendador. */
  async findActiveTenantIds(): Promise<string[]> {
    const accounts = await prisma.account.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    return accounts.map((a) => a.id);
  }

  /** Dados básicos da conta atual — para conferir o nome no encerramento (RN-2205). */
  async findCurrent() {
    return prisma.account.findUnique({
      where: { id: requireTenantId() },
      select: { id: true, name: true, status: true, createdAt: true },
    });
  }

  /** Dump completo do tenant atual para portabilidade (RN-2204). Inclui PII do dono. */
  async exportCurrent() {
    return prisma.account.findUnique({
      where: { id: requireTenantId() },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        acceptedTermsAt: true,
        acceptedTermsVersion: true,
        users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        clients: true,
        subscriptions: true,
        invoices: { include: { items: true } },
        payments: true,
      },
    });
  }

  /** Elimina o tenant atual e tudo em cascata (RN-2205). */
  async deleteCurrent() {
    return prisma.account.delete({ where: { id: requireTenantId() } });
  }
}
