-- Liga/Desliga o Acesso (spec 0042 — F12). Aditiva e idempotente.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "accessOverride" TEXT;

CREATE TABLE IF NOT EXISTS "AccessSetting" (
    "id"                    TEXT NOT NULL,
    "enabled"               BOOLEAN NOT NULL DEFAULT false,
    "graceDays"             INTEGER NOT NULL DEFAULT 3,
    "requireSignedContract" BOOLEAN NOT NULL DEFAULT true,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"              TEXT NOT NULL,
    CONSTRAINT "AccessSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccessSetting_tenantId_key" ON "AccessSetting"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessSetting_tenantId_fkey') THEN
    ALTER TABLE "AccessSetting" ADD CONSTRAINT "AccessSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
