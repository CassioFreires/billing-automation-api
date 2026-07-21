import prisma from '../database/prisma.js';

/**
 * Identidade do super-admin da plataforma (spec 0031). Tabela SEPARADA do
 * tenant (User/Account) — sem tenantId. Acesso global (não usa requireTenantId).
 */
export class PlatformAdminRepository {
  findByEmail(email: string) {
    return prisma.platformAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string) {
    return prisma.platformAdmin.findUnique({ where: { id } });
  }

  /** Cria/atualiza um admin (usado pelo bootstrap `create-admin`). */
  upsert(data: { email: string; name: string; passwordHash: string; role?: string }) {
    const email = data.email.trim().toLowerCase();
    return prisma.platformAdmin.upsert({
      where: { email },
      update: { name: data.name, passwordHash: data.passwordHash, role: data.role ?? 'SUPERADMIN' },
      create: { email, name: data.name, passwordHash: data.passwordHash, role: data.role ?? 'SUPERADMIN' },
    });
  }
}
