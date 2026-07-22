-- Portal do pagador (spec 0027): token por cliente para ver todas as cobranças. Aditiva/idempotente.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "portalToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_portalToken_key" ON "Client"("portalToken");
