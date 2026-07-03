-- Configuração de pagamento por tenant (spec 0012). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "PaymentSetting" (
    "id"                TEXT NOT NULL,
    "provider"          TEXT NOT NULL DEFAULT 'infinitepay',
    "infinitepayHandle" TEXT,
    "redirectUrl"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"          TEXT NOT NULL,
    CONSTRAINT "PaymentSetting_pkey" PRIMARY KEY ("id")
);

-- 1 configuração por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentSetting_tenantId_key" ON "PaymentSetting"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentSetting_tenantId_fkey') THEN
        ALTER TABLE "PaymentSetting"
            ADD CONSTRAINT "PaymentSetting_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
