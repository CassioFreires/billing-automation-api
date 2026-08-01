-- Modularização & Entitlements (spec 0051). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "ModuleEntitlement" (
    "id"         TEXT NOT NULL,
    "moduleKey"  TEXT NOT NULL,
    "granted"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "ModuleEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ModuleEntitlement_tenantId_moduleKey_key"
    ON "ModuleEntitlement"("tenantId", "moduleKey");
CREATE INDEX IF NOT EXISTS "ModuleEntitlement_tenantId_idx"
    ON "ModuleEntitlement"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModuleEntitlement_tenantId_fkey') THEN
    ALTER TABLE "ModuleEntitlement" ADD CONSTRAINT "ModuleEntitlement_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Grandfather (RN-M6): concede os 4 add-ons a TODA conta existente, para que ninguém que
-- já usa uma feature perca acesso ao ligar a modularização. Contas NOVAS seguem o default
-- do plano (resolvido em runtime). Idempotente via ON CONFLICT.
INSERT INTO "ModuleEntitlement" ("id", "moduleKey", "granted", "tenantId", "createdAt", "lastUpdate")
SELECT
    gen_random_uuid()::text,
    m.key,
    true,
    a."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Account" a
CROSS JOIN (VALUES ('fiscal'), ('access'), ('growth'), ('recovery')) AS m(key)
ON CONFLICT ("tenantId", "moduleKey") DO NOTHING;
