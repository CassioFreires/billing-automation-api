-- Cobrança do próprio SaaS (spec 0020): planos + trial + assinatura de plataforma.
-- Aditiva e idempotente (padrão das migrations anteriores).

-- 1) Assinatura de plataforma (1:1 com Account).
CREATE TABLE IF NOT EXISTS "PlatformSubscription" (
    "id"               TEXT NOT NULL,
    "plan"             TEXT NOT NULL DEFAULT 'free',
    "status"           TEXT NOT NULL DEFAULT 'trialing',
    "trialEndsAt"      TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"         TEXT NOT NULL,
    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformSubscription_tenantId_key" ON "PlatformSubscription"("tenantId");

-- 2) Cobrança da plataforma (Adimplo → tenant).
CREATE TABLE IF NOT EXISTS "PlatformInvoice" (
    "id"           TEXT NOT NULL,
    "plan"         TEXT NOT NULL,
    "amountCents"  INTEGER NOT NULL,
    "period"       TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "gatewayId"    TEXT,
    "checkoutUrl"  TEXT,
    "pixCopyPaste" TEXT,
    "paidAt"       TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"     TEXT NOT NULL,
    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformInvoice_gatewayId_key" ON "PlatformInvoice"("gatewayId");
CREATE INDEX IF NOT EXISTS "PlatformInvoice_tenantId_idx" ON "PlatformInvoice"("tenantId");

-- 3) Foreign keys (guardadas em DO $$ para idempotência).
DO $$ BEGIN
  ALTER TABLE "PlatformSubscription"
    ADD CONSTRAINT "PlatformSubscription_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlatformInvoice"
    ADD CONSTRAINT "PlatformInvoice_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Backfill (grandfathering): toda conta EXISTENTE sem assinatura recebe uma
--    linha 'active/pro' com período muito distante — nunca é bloqueada. Novas
--    contas recebem trial real (definido no signup pela aplicação).
INSERT INTO "PlatformSubscription" ("id", "plan", "status", "currentPeriodEnd", "tenantId")
SELECT gen_random_uuid(), 'pro', 'active', (CURRENT_TIMESTAMP + INTERVAL '100 years'), a."id"
FROM "Account" a
WHERE NOT EXISTS (
  SELECT 1 FROM "PlatformSubscription" ps WHERE ps."tenantId" = a."id"
);
