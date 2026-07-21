/**
 * Seed de DESENVOLVIMENTO — popula um tenant demo completo para testes.
 *
 * JS puro (ESM) de propósito: roda com o `node` da imagem de produção, sem
 * precisar do tsx. Assim dá para semear direto no container:
 *
 *   docker compose -f docker-compose.free.yml exec api node prisma/seed.mjs
 *
 * Ou local:  npm run db:seed   (usa DATABASE_URL do ambiente/.env)
 *
 * Idempotente: recria os dados do tenant demo a cada execução; NÃO toca em
 * outros tenants. Nunca rode em produção com dados reais.
 *
 * Login demo:  demo@autocore.app  ·  senha demo12345
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_TENANT_ID = "00000000-0000-0000-0000-0000000000de";
const DEMO_EMAIL = "demo@autocore.app";
const DEMO_PASSWORD = "demo12345";

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function main() {
  console.log("🌱 Seed: iniciando…");

  const account = await prisma.account.upsert({
    where: { id: DEMO_TENANT_ID },
    update: { name: "Clínica OdontoFit (Demo)", status: "ACTIVE" },
    create: { id: DEMO_TENANT_ID, name: "Clínica OdontoFit (Demo)", status: "ACTIVE" },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, tenantId: account.id, name: "Conta Demo", role: "OWNER" },
    create: {
      email: DEMO_EMAIL,
      name: "Conta Demo",
      passwordHash,
      role: "OWNER",
      tenantId: account.id,
    },
  });

  // Onboarding (spec 0021): o demo já tem clientes/faturas, então dispensa o
  // checklist para não poluir a demonstração.
  await prisma.onboardingState.upsert({
    where: { tenantId: account.id },
    update: { dismissed: true },
    create: { tenantId: account.id, dismissed: true, whatsappSkipped: true },
  });

  // Idempotência: limpa apenas os dados do tenant demo
  // (invoices antes de subscriptions/clients por causa das FKs)
  await prisma.invoice.deleteMany({ where: { tenantId: account.id } });
  await prisma.subscription.deleteMany({ where: { tenantId: account.id } });
  await prisma.client.deleteMany({ where: { tenantId: account.id } });

  const clients = [
    {
      name: "Rodrigo Silva",
      phone: "5511990001111",
      document: "11122233344",
      status: "EM_ATRASO",
      debtValue: 320.5,
      invoices: [{ value: 320.5, dueDate: daysFromNow(-8), status: "OVERDUE", notificationSent: true }],
    },
    {
      name: "Mariana Costa",
      phone: "5511990002222",
      document: "22233344455",
      status: "EM_ATRASO",
      debtValue: 150.0,
      invoices: [{ value: 150.0, dueDate: daysFromNow(-3), status: "PENDING", notificationSent: false }],
    },
    {
      name: "João Pereira",
      phone: "5511990003333",
      document: "33344455566",
      status: "EM_DIA",
      debtValue: 0,
      invoices: [
        { value: 200.0, dueDate: daysFromNow(-20), status: "PAID", paidAt: daysFromNow(-18) },
        { value: 200.0, dueDate: daysFromNow(10), status: "PENDING" },
      ],
    },
    {
      name: "Ana Beatriz",
      phone: "5511990004444",
      document: "44455566677",
      status: "EM_DIA",
      debtValue: 89.9,
      invoices: [{ value: 89.9, dueDate: daysFromNow(5), status: "PENDING" }],
    },
    {
      name: "Carlos Mendes",
      phone: "5511990005555",
      document: "55566677788",
      status: "EM_ATRASO",
      debtValue: 540.0,
      invoices: [
        { value: 270.0, dueDate: daysFromNow(-15), status: "OVERDUE", notificationSent: true },
        { value: 270.0, dueDate: daysFromNow(-1), status: "PENDING", notificationSent: false },
      ],
    },
    {
      name: "Fernanda Lima",
      phone: "5511990006666",
      document: "66677788899",
      status: "EM_DIA",
      debtValue: 0,
      invoices: [{ value: 430.0, dueDate: daysFromNow(-30), status: "PAID", paidAt: daysFromNow(-29) }],
    },
  ];

  let invoiceCount = 0;
  let seq = 0;
  const clientByName = {};
  for (const c of clients) {
    const { invoices, ...clientData } = c;
    const client = await prisma.client.create({
      data: { ...clientData, tenantId: account.id },
    });
    clientByName[client.name] = client;

    for (const inv of invoices) {
      seq += 1;
      await prisma.invoice.create({
        data: {
          ...inv,
          tenantId: account.id,
          clientId: client.id,
          gatewayId: `seed_${seq}_${client.id.slice(0, 8)}`,
          pixCopyPaste: `00020101021226880014br.gov.bcb.pix_SEED_${seq}`,
          items: {
            create: [
              { description: "Mensalidade", quantity: 1, unitPrice: inv.value },
            ],
          },
        },
      });
      invoiceCount += 1;
    }
  }

  // Assinaturas recorrentes demo (spec 0009). nextRunDate no passado para que
  // POST /api/subscriptions/run gere a fatura da competência já na 1ª execução.
  const subscriptions = [
    { client: "João Pereira", description: "Plano Mensal Odonto", amount: 129.9, dayOfMonth: 10 },
    { client: "Ana Beatriz", description: "Clareamento (assinatura)", amount: 89.9, dayOfMonth: 5 },
  ];
  let subCount = 0;
  for (const s of subscriptions) {
    const client = clientByName[s.client];
    if (!client) continue;
    await prisma.subscription.create({
      data: {
        tenantId: account.id,
        clientId: client.id,
        description: s.description,
        amount: s.amount,
        dayOfMonth: s.dayOfMonth,
        status: "ACTIVE",
        startDate: daysFromNow(-40),
        nextRunDate: daysFromNow(-2), // vencida → o run gera na hora
      },
    });
    subCount += 1;
  }

  console.log(
    `🌱 Seed OK → tenant "${account.name}", ${clients.length} clientes, ${invoiceCount} faturas, ${subCount} assinaturas.`
  );
  console.log(`   Login demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
