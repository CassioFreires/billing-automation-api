-- NFS-e / Nota Fiscal de Serviço (spec 0047 — F7). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "FiscalSetting" (
    "id"              TEXT NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT false,
    "provider"        TEXT NOT NULL DEFAULT 'mock',
    "apiKey"          TEXT,
    "webhookSecret"   TEXT,
    "companyId"       TEXT,
    "cityServiceCode" TEXT,
    "autoEmitOnPaid"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"        TEXT NOT NULL,
    CONSTRAINT "FiscalSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalSetting_tenantId_key" ON "FiscalSetting"("tenantId");

CREATE TABLE IF NOT EXISTS "FiscalDocument" (
    "id"          TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "provider"    TEXT NOT NULL DEFAULT 'mock',
    "providerId"  TEXT,
    "number"      TEXT,
    "pdfUrl"      TEXT,
    "xmlUrl"      TEXT,
    "message"     TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt"    TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "invoiceId"   TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_invoiceId_key" ON "FiscalDocument"("invoiceId");
CREATE INDEX IF NOT EXISTS "FiscalDocument_tenantId_status_idx" ON "FiscalDocument"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "FiscalDocument_providerId_idx" ON "FiscalDocument"("providerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalSetting_tenantId_fkey') THEN
    ALTER TABLE "FiscalSetting" ADD CONSTRAINT "FiscalSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDocument_invoiceId_fkey') THEN
    ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDocument_clientId_fkey') THEN
    ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDocument_tenantId_fkey') THEN
    ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
