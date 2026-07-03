-- Itens de fatura (spec 0007). Aditiva e idempotente.
-- Detalhe do que está sendo cobrado; total da fatura = soma(quantity * unitPrice).

CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id"          TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity"    INTEGER NOT NULL DEFAULT 1,
    "unitPrice"   DOUBLE PRECISION NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId"   TEXT NOT NULL,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceItem_invoiceId_fkey') THEN
        ALTER TABLE "InvoiceItem"
            ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
