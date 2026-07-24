-- Segura Quem Quer Sair (spec 0037 — F11). Pedido de cancelamento + retenção.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "CancellationRequest" (
    "id"             TEXT NOT NULL,
    "reason"         TEXT,
    "status"         TEXT NOT NULL DEFAULT 'open',
    "recommended"    TEXT,
    "saveOffer"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"     TIMESTAMP(3),
    "clientId"       TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CancellationRequest_tenantId_status_idx" ON "CancellationRequest"("tenantId", "status");

-- FKs com guarda (não falha se já existirem).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_clientId_fkey') THEN
    ALTER TABLE "CancellationRequest"
      ADD CONSTRAINT "CancellationRequest_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_subscriptionId_fkey') THEN
    ALTER TABLE "CancellationRequest"
      ADD CONSTRAINT "CancellationRequest_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_tenantId_fkey') THEN
    ALTER TABLE "CancellationRequest"
      ADD CONSTRAINT "CancellationRequest_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
