-- Radar de Risco (spec 0035 — F2). Saúde/score do cliente, 1:1 com Client.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "ClientHealth" (
    "id"         TEXT NOT NULL,
    "score"      INTEGER NOT NULL,
    "band"       TEXT NOT NULL,
    "signals"    JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId"   TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "ClientHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientHealth_clientId_key" ON "ClientHealth"("clientId");
CREATE INDEX IF NOT EXISTS "ClientHealth_tenantId_band_idx" ON "ClientHealth"("tenantId", "band");

-- FKs com guarda (não falha se já existirem) — mesmo padrão da migration do F1.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientHealth_clientId_fkey') THEN
    ALTER TABLE "ClientHealth"
      ADD CONSTRAINT "ClientHealth_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientHealth_tenantId_fkey') THEN
    ALTER TABLE "ClientHealth"
      ADD CONSTRAINT "ClientHealth_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
