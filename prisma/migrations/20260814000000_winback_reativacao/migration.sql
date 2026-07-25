-- Winback / reativação (spec 0045 — F5). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "WinbackSetting" (
    "id"              TEXT NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT false,
    "daysAfter"       INTEGER NOT NULL DEFAULT 15,
    "discountPercent" INTEGER NOT NULL DEFAULT 10,
    "message"         TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"        TEXT NOT NULL,
    CONSTRAINT "WinbackSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WinbackSetting_tenantId_key" ON "WinbackSetting"("tenantId");

CREATE TABLE IF NOT EXISTS "WinbackCase" (
    "id"             TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "eligibleAt"     TIMESTAMP(3) NOT NULL,
    "sentAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" TEXT NOT NULL,
    "invoiceId"      TEXT,
    "clientId"       TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    CONSTRAINT "WinbackCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WinbackCase_subscriptionId_key" ON "WinbackCase"("subscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "WinbackCase_invoiceId_key" ON "WinbackCase"("invoiceId");
CREATE INDEX IF NOT EXISTS "WinbackCase_tenantId_status_idx" ON "WinbackCase"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WinbackSetting_tenantId_fkey') THEN
    ALTER TABLE "WinbackSetting" ADD CONSTRAINT "WinbackSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WinbackCase_subscriptionId_fkey') THEN
    ALTER TABLE "WinbackCase" ADD CONSTRAINT "WinbackCase_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WinbackCase_invoiceId_fkey') THEN
    ALTER TABLE "WinbackCase" ADD CONSTRAINT "WinbackCase_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WinbackCase_clientId_fkey') THEN
    ALTER TABLE "WinbackCase" ADD CONSTRAINT "WinbackCase_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WinbackCase_tenantId_fkey') THEN
    ALTER TABLE "WinbackCase" ADD CONSTRAINT "WinbackCase_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
