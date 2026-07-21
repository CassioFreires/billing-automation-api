-- Estado do onboarding guiado por tenant (spec 0021). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "OnboardingState" (
    "id"              TEXT NOT NULL,
    "dismissed"       BOOLEAN NOT NULL DEFAULT false,
    "whatsappSkipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"        TEXT NOT NULL,
    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingState_tenantId_key" ON "OnboardingState"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingState_tenantId_fkey') THEN
        ALTER TABLE "OnboardingState"
            ADD CONSTRAINT "OnboardingState_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
