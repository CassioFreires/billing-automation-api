-- Conexão IoT/Catracas (spec 0043 — F13). Aditiva e idempotente.

-- Último estado de acesso propagado (base para detectar transição no sweep).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "accessState" TEXT;

-- Credenciais de integração por tenant (API key + webhook de saída).
CREATE TABLE IF NOT EXISTS "AccessIntegration" (
    "id"            TEXT NOT NULL,
    "enabled"       BOOLEAN NOT NULL DEFAULT false,
    "apiKeyHash"    TEXT,
    "apiKeyPrefix"  TEXT,
    "webhookUrl"    TEXT,
    "webhookSecret" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"      TEXT NOT NULL,
    CONSTRAINT "AccessIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccessIntegration_tenantId_key" ON "AccessIntegration"("tenantId");
CREATE INDEX IF NOT EXISTS "AccessIntegration_apiKeyHash_idx" ON "AccessIntegration"("apiKeyHash");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessIntegration_tenantId_fkey') THEN
    ALTER TABLE "AccessIntegration" ADD CONSTRAINT "AccessIntegration_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Log append-only de transições de acesso (auditoria).
CREATE TABLE IF NOT EXISTS "AccessEvent" (
    "id"            TEXT NOT NULL,
    "fromState"     TEXT,
    "toState"       TEXT NOT NULL,
    "granted"       BOOLEAN NOT NULL,
    "reason"        TEXT NOT NULL DEFAULT '',
    "webhookStatus" TEXT NOT NULL DEFAULT 'skipped',
    "webhookCode"   INTEGER,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId"      TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccessEvent_tenantId_createdAt_idx" ON "AccessEvent"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessEvent_tenantId_clientId_idx" ON "AccessEvent"("tenantId", "clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessEvent_clientId_fkey') THEN
    ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessEvent_tenantId_fkey') THEN
    ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
