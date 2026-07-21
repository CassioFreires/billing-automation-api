/**
 * Bootstrap do super-admin da plataforma (spec 0031).
 *
 * Cria/atualiza um PlatformAdmin a partir das envs — NUNCA por auto-cadastro.
 * JS puro (ESM) para rodar com o `node` da imagem de produção (sem tsx):
 *
 *   docker compose -f docker-compose.free.yml exec \
 *     -e PLATFORM_ADMIN_BOOTSTRAP_EMAIL=voce@dominio.com \
 *     -e PLATFORM_ADMIN_BOOTSTRAP_PASSWORD='umaSenhaForte' \
 *     api node scripts/create-admin.mjs
 *
 * Ou local:  npm run create-admin   (usa as envs do .env)
 *
 * Idempotente: se o e-mail já existe, atualiza nome/senha/role.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_BOOTSTRAP_NAME ?? 'Administrador';
  const role = process.env.PLATFORM_ADMIN_BOOTSTRAP_ROLE ?? 'SUPERADMIN';

  if (!email || !password) {
    console.error(
      '✖ Defina PLATFORM_ADMIN_BOOTSTRAP_EMAIL e PLATFORM_ADMIN_BOOTSTRAP_PASSWORD.'
    );
    process.exit(1);
  }

  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.platformAdmin.upsert({
    where: { email: normalized },
    update: { name, passwordHash, role },
    create: { email: normalized, name, passwordHash, role },
  });

  console.log(`✔ PlatformAdmin pronto: ${admin.email} (${admin.role})`);
}

main()
  .catch((e) => {
    console.error('✖ Falha ao criar admin:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
