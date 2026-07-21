-- Console de plataforma (spec 0031): identidade do super-admin separada do tenant.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "PlatformAdmin" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role"         TEXT NOT NULL DEFAULT 'SUPERADMIN',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
