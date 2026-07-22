-- Régua de cobrança multi-passo (spec 0026). Aditiva e idempotente.

-- Rastreio de passo por fatura.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reminderStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);

-- Config de régua por tenant.
CREATE TABLE IF NOT EXISTS "ReguaSetting" (
    "id"         TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT false,
    "steps"      JSONB NOT NULL DEFAULT '[]',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "ReguaSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReguaSetting_tenantId_key" ON "ReguaSetting"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReguaSetting_tenantId_fkey') THEN
        ALTER TABLE "ReguaSetting"
            ADD CONSTRAINT "ReguaSetting_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
