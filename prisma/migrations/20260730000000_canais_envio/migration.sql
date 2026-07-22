-- Canais de envio (spec 0032). Aditiva e idempotente.

-- E-mail opcional do cliente (canal de e-mail).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Canal de envio das cobranças por tenant (whatsapp | email | both).
CREATE TABLE IF NOT EXISTS "ChannelSetting" (
    "id"         TEXT NOT NULL,
    "channel"    TEXT NOT NULL DEFAULT 'whatsapp',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "ChannelSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelSetting_tenantId_key" ON "ChannelSetting"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChannelSetting_tenantId_fkey') THEN
        ALTER TABLE "ChannelSetting"
            ADD CONSTRAINT "ChannelSetting_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
