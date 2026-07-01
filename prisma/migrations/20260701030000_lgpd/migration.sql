-- LGPD (spec 0004). Aditiva e idempotente.
-- Marca quando o titular (Client) foi anonimizado.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);
