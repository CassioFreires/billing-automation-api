-- Fundação "Elo" (spec 0016): link próprio do Adimplo + eventos de interação.
-- Aditiva e idempotente (segue o padrão das migrations anteriores).

-- 1) Link PRÓPRIO na fatura (token não-adivinhável; global entre tenants).
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "linkToken" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_linkToken_key'
    ) THEN
        ALTER TABLE "Invoice"
            ADD CONSTRAINT "Invoice_linkToken_key" UNIQUE ("linkToken");
    END IF;
END $$;

-- 2) Eventos de interação (append-only). type/channel como TEXT (enum nativo = follow-up D-07).
CREATE TABLE IF NOT EXISTS "InteractionEvent" (
    "id"         TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "channel"    TEXT,
    "metadata"   JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId"  TEXT,
    "clientId"   TEXT,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "InteractionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InteractionEvent_invoiceId_idx"           ON "InteractionEvent"("invoiceId");
CREATE INDEX IF NOT EXISTS "InteractionEvent_invoiceId_type_idx"      ON "InteractionEvent"("invoiceId", "type");
CREATE INDEX IF NOT EXISTS "InteractionEvent_tenantId_occurredAt_idx" ON "InteractionEvent"("tenantId", "occurredAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InteractionEvent_invoiceId_fkey') THEN
        ALTER TABLE "InteractionEvent"
            ADD CONSTRAINT "InteractionEvent_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InteractionEvent_clientId_fkey') THEN
        ALTER TABLE "InteractionEvent"
            ADD CONSTRAINT "InteractionEvent_clientId_fkey"
            FOREIGN KEY ("clientId") REFERENCES "Client"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InteractionEvent_tenantId_fkey') THEN
        ALTER TABLE "InteractionEvent"
            ADD CONSTRAINT "InteractionEvent_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
