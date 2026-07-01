-- Multi-tenancy (spec 0001). Migração SEGURA e em passos, idempotente.
-- Pode ser rodada por `prisma migrate deploy` ou manualmente via psql.
-- Preserva os dados atuais atribuindo-os a um Account "default".

-- 1) Tabela Account
CREATE TABLE IF NOT EXISTS "Account" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- 2) Account default que recebe os dados existentes
INSERT INTO "Account" ("id", "name", "status", "createdAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 3) Coluna tenantId (nullable primeiro, para backfill)
ALTER TABLE "Client"  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 4) Backfill dos registros atuais para o tenant default
UPDATE "Client"  SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "Invoice" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

-- 5) Agora torna NOT NULL
ALTER TABLE "Client"  ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "tenantId" SET NOT NULL;

-- 6) Unicidade de telefone passa a ser POR TENANT
DROP INDEX IF EXISTS "Client_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Client_tenantId_phone_key" ON "Client"("tenantId", "phone");

-- 7) Índices compostos por tenant
CREATE INDEX IF NOT EXISTS "Client_tenantId_status_idx"   ON "Client"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_idx"  ON "Invoice"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_clientId_idx" ON "Invoice"("tenantId", "clientId");

-- 8) Foreign keys (guardadas para serem idempotentes)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_tenantId_fkey') THEN
        ALTER TABLE "Client"
            ADD CONSTRAINT "Client_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_tenantId_fkey') THEN
        ALTER TABLE "Invoice"
            ADD CONSTRAINT "Invoice_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
