import prisma from '../database/prisma.js';
import { TRIAL_DAYS } from '../domain/plans.js';
import { LEGAL_VERSION } from '../domain/legal.js';

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

  // --- Gestão de equipe por tenant (spec 0030) ---

  /** Lista os usuários do tenant (sem o hash de senha). */
  listByTenant(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Usuário por id DENTRO do tenant (escopo de segurança da gestão de equipe). */
  findByIdInTenant(id: string, tenantId: string) {
    return prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, email: true, role: true, tenantId: true },
    });
  }

  /** Cria um membro no tenant (papel ADMIN/MEMBER). E-mail é único global. */
  createMember(input: {
    tenantId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
  }) {
    return prisma.user.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  updateRole(id: string, role: string) {
    return prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  deleteById(id: string) {
    return prisma.user.delete({ where: { id } });
  }

  /** Quantos OWNER existem no tenant — protege o "último dono" (RN-3004). */
  countOwners(tenantId: string) {
    return prisma.user.count({ where: { tenantId, role: 'OWNER' } });
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
        // LGPD (spec 0022): prova de aceite dos termos no cadastro.
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: LEGAL_VERSION,
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
