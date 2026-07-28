-- White-label (spec 0050, Fase 3). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "BrandSetting" (
    "id"         TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#14a08a',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "BrandSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BrandSetting_tenantId_key" ON "BrandSetting"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandSetting_tenantId_fkey') THEN
    ALTER TABLE "BrandSetting" ADD CONSTRAINT "BrandSetting_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
