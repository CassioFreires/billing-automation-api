-- Loja no Pagamento (spec 0044 — F15). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "OfferProduct" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'addon',
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "OfferProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OfferProduct_tenantId_active_idx" ON "OfferProduct"("tenantId", "active");

CREATE TABLE IF NOT EXISTS "OfferPurchase" (
    "id"         TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerId"    TEXT NOT NULL,
    "invoiceId"  TEXT NOT NULL,
    "clientId"   TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "OfferPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfferPurchase_invoiceId_key" ON "OfferPurchase"("invoiceId");
CREATE INDEX IF NOT EXISTS "OfferPurchase_tenantId_createdAt_idx" ON "OfferPurchase"("tenantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferProduct_tenantId_fkey') THEN
    ALTER TABLE "OfferProduct" ADD CONSTRAINT "OfferProduct_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferPurchase_offerId_fkey') THEN
    ALTER TABLE "OfferPurchase" ADD CONSTRAINT "OfferPurchase_offerId_fkey"
      FOREIGN KEY ("offerId") REFERENCES "OfferProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferPurchase_invoiceId_fkey') THEN
    ALTER TABLE "OfferPurchase" ADD CONSTRAINT "OfferPurchase_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferPurchase_clientId_fkey') THEN
    ALTER TABLE "OfferPurchase" ADD CONSTRAINT "OfferPurchase_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfferPurchase_tenantId_fkey') THEN
    ALTER TABLE "OfferPurchase" ADD CONSTRAINT "OfferPurchase_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
