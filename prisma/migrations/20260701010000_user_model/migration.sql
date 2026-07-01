-- Modelo de usuário (spec 0002). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "User" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "role"         TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"     TEXT NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_tenantId_fkey') THEN
        ALTER TABLE "User"
            ADD CONSTRAINT "User_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
