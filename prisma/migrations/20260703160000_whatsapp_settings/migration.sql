-- Configuração de WhatsApp por tenant (spec 0014). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "WhatsappSetting" (
    "id"            TEXT NOT NULL,
    "provider"      TEXT NOT NULL DEFAULT 'log',
    "phoneNumberId" TEXT,
    "token"         TEXT,
    "apiVersion"    TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"      TEXT NOT NULL,
    CONSTRAINT "WhatsappSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappSetting_tenantId_key" ON "WhatsappSetting"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappSetting_tenantId_fkey') THEN
        ALTER TABLE "WhatsappSetting"
            ADD CONSTRAINT "WhatsappSetting_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
