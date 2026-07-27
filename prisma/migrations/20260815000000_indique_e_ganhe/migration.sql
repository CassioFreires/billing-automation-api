-- Indique e Ganhe (spec 0046 — F16). Aditiva e idempotente.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "referredByClientId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "referralCreditCents" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_referralCode_key" ON "Client"("referralCode");

CREATE TABLE IF NOT EXISTS "ReferralSetting" (
    "id"          TEXT NOT NULL,
    "enabled"     BOOLEAN NOT NULL DEFAULT false,
    "rewardCents" INTEGER NOT NULL DEFAULT 1000,
    "rewardWho"   TEXT NOT NULL DEFAULT 'both',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"    TEXT NOT NULL,
    CONSTRAINT "ReferralSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralSetting_tenantId_key" ON "ReferralSetting"("tenantId");

CREATE TABLE IF NOT EXISTS "Referral" (
    "id"               TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "rewardCents"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt"      TIMESTAMP(3),
    "referrerClientId" TEXT NOT NULL,
    "referredClientId" TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredClientId_key" ON "Referral"("referredClientId");
CREATE INDEX IF NOT EXISTS "Referral_tenantId_status_idx" ON "Referral"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralSetting_tenantId_fkey') THEN
    ALTER TABLE "ReferralSetting" ADD CONSTRAINT "ReferralSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_referrerClientId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerClientId_fkey"
      FOREIGN KEY ("referrerClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_referredClientId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredClientId_fkey"
      FOREIGN KEY ("referredClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_tenantId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
