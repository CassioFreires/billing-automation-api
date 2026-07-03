-- Cobrança recorrente / assinaturas (spec 0009). Aditiva e idempotente.
-- Cria a tabela Subscription e liga a Invoice à assinatura de origem (subscriptionId + period),
-- com unicidade [subscriptionId, period] para garantir 1 fatura por assinatura/mês (RN-R3).

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id"          TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "dayOfMonth"  INTEGER NOT NULL DEFAULT 10,
    "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId"    TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_clientId_idx" ON "Subscription"("clientId");
CREATE INDEX IF NOT EXISTS "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Subscription_status_nextRunDate_idx" ON "Subscription"("status", "nextRunDate");

-- FKs da Subscription
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_clientId_fkey') THEN
        ALTER TABLE "Subscription"
            ADD CONSTRAINT "Subscription_clientId_fkey"
            FOREIGN KEY ("clientId") REFERENCES "Client"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_tenantId_fkey') THEN
        ALTER TABLE "Subscription"
            ADD CONSTRAINT "Subscription_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Colunas de origem recorrente na Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "period" TEXT;

-- FK Invoice -> Subscription (SET NULL: apagar a assinatura não apaga o histórico de faturas)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_subscriptionId_fkey') THEN
        ALTER TABLE "Invoice"
            ADD CONSTRAINT "Invoice_subscriptionId_fkey"
            FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Unicidade [subscriptionId, period]: no Postgres NULLs são distintos,
-- então faturas avulsas (subscriptionId NULL) não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_subscriptionId_period_key"
    ON "Invoice"("subscriptionId", "period");
