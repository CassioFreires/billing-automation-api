-- Contrato no Celular (spec 0040 — F14). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "ContractSetting" (
    "id"         TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT false,
    "title"      TEXT NOT NULL DEFAULT 'Contrato de prestação de serviço',
    "body"       TEXT NOT NULL DEFAULT '',
    "version"    INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "ContractSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContractSetting_tenantId_key" ON "ContractSetting"("tenantId");

CREATE TABLE IF NOT EXISTS "ContractAcceptance" (
    "id"               TEXT NOT NULL,
    "version"          INTEGER NOT NULL,
    "acceptedName"     TEXT NOT NULL,
    "acceptedDocument" TEXT,
    "ipHash"           TEXT,
    "userAgent"        TEXT,
    "acceptedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId"         TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    CONSTRAINT "ContractAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractAcceptance_tenantId_clientId_idx" ON "ContractAcceptance"("tenantId", "clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractSetting_tenantId_fkey') THEN
    ALTER TABLE "ContractSetting" ADD CONSTRAINT "ContractSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractAcceptance_clientId_fkey') THEN
    ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContractAcceptance_tenantId_fkey') THEN
    ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
