import prisma from '../database/prisma.js';

/**
 * Acesso a contas/tenants. ATENÇÃO: diferente dos outros repositórios, aqui há
 * consultas de SISTEMA (cross-tenant) — usadas pelo agendador de cobrança
 * (spec 0010). Elas NÃO filtram por tenant de propósito e só devem ser
 * chamadas por rotas protegidas por segredo de sistema (cronAuth), nunca por
 * uma rota autenticada por JWT de um tenant.
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
}
