-- Descontos de retenção configuráveis (spec 0038 — F11.1). Aditiva e idempotente.

-- Desconto ativo na assinatura.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "discountPercent" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "discountUntil" TIMESTAMP(3);

-- Histórico do desconto aplicado no pedido de cancelamento.
ALTER TABLE "CancellationRequest" ADD COLUMN IF NOT EXISTS "appliedPercent" INTEGER;
ALTER TABLE "CancellationRequest" ADD COLUMN IF NOT EXISTS "appliedUntil" TIMESTAMP(3);

-- Config de retenção por tenant.
CREATE TABLE IF NOT EXISTS "RetentionSetting" (
    "id"                     TEXT NOT NULL,
    "discountPercent"        INTEGER NOT NULL DEFAULT 30,
    "discountDurationMonths" INTEGER NOT NULL DEFAULT 2,
    "discountEnabled"        BOOLEAN NOT NULL DEFAULT true,
    "pauseEnabled"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"               TEXT NOT NULL,
    CONSTRAINT "RetentionSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RetentionSetting_tenantId_key" ON "RetentionSetting"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RetentionSetting_tenantId_fkey') THEN
    ALTER TABLE "RetentionSetting"
      ADD CONSTRAINT "RetentionSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
