-- Recebimentos (spec 0015). Fonte única de "dinheiro que entrou": manual + gateway.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "Payment" (
    "id"         TEXT NOT NULL,
    "amount"     NUMERIC(12,2) NOT NULL,
    "method"     TEXT,
    "source"     TEXT NOT NULL,
    "paidAt"     TIMESTAMP(3) NOT NULL,
    "note"       TEXT,
    "receiptUrl" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId"  TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx"        ON "Payment"("invoiceId");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_idx"         ON "Payment"("tenantId");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_paidAt_idx"  ON "Payment"("tenantId", "paidAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_invoiceId_fkey') THEN
        ALTER TABLE "Payment"
            ADD CONSTRAINT "Payment_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_tenantId_fkey') THEN
        ALTER TABLE "Payment"
            ADD CONSTRAINT "Payment_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
