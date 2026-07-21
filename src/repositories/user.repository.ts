import prisma from '../database/prisma.js';
import { TRIAL_DAYS } from '../domain/plans.js';

/**
 * Repositório de usuários.
 *
 * ⚠️ É GLOBAL (não usa tenant-context): login e signup são as entradas que
 * resolvem/criam o tenant, então rodam sem escopo (multi-tenancy — spec 0001/0002).
 */
export class UserRepository {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  /** Busca por id (GLOBAL) — usado pelo gating de super-admin (spec 0023). */
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  /** Usuário OWNER de um tenant (GLOBAL) — alvo da impersonação (spec 0023). */
  findOwnerByTenant(tenantId: string) {
    return prisma.user.findFirst({
      where: { tenantId, role: 'OWNER' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Cria a conta (tenant) + usuário dono + trial de plataforma, atomicamente (RN-U3). */
  async createAccountWithOwner(input: {
    accountName: string;
    name: string;
    email: string;
    passwordHash: string;
  }) {
    // Trial de 14 dias com recursos Pro (spec 0020). Mesmo create atômico.
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const account = await prisma.account.create({
      data: {
        name: input.accountName,
        users: {
          create: {
            name: input.name,
            email: input.email,
            passwordHash: input.passwordHash,
            role: 'OWNER',
          },
        },
        platformSubscription: {
          create: { plan: 'pro', status: 'trialing', trialEndsAt },
        },
      },
      include: { users: true },
    });

    return account.users[0];
  }
}
