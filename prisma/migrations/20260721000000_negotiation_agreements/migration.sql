-- Autonegociação / "Botão de Alívio de Caixa" (spec 0018 — M2).
-- Aditiva e idempotente (segue o padrão das migrations anteriores).

-- 1) Regras de negociação por tenant (1:1 com Account).
CREATE TABLE IF NOT EXISTS "NegotiationSetting" (
    "id"                  TEXT NOT NULL,
    "enabled"             BOOLEAN NOT NULL DEFAULT false,
    "hesitationOpens"     INTEGER NOT NULL DEFAULT 3,
    "discountEnabled"     BOOLEAN NOT NULL DEFAULT false,
    "discountPercent"     DECIMAL(5,4) NOT NULL DEFAULT 0,
    "installmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxInstallments"     INTEGER NOT NULL DEFAULT 1,
    "deferEnabled"        BOOLEAN NOT NULL DEFAULT false,
    "deferMaxDays"        INTEGER NOT NULL DEFAULT 0,
    "deferFeePercent"     DECIMAL(5,4) NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId"            TEXT NOT NULL,
    CONSTRAINT "NegotiationSetting_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegotiationSetting_tenantId_key') THEN
        ALTER TABLE "NegotiationSetting"
            ADD CONSTRAINT "NegotiationSetting_tenantId_key" UNIQUE ("tenantId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegotiationSetting_tenantId_fkey') THEN
        ALTER TABLE "NegotiationSetting"
            ADD CONSTRAINT "NegotiationSetting_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 2) Acordos de autonegociação.
CREATE TABLE IF NOT EXISTS "Agreement" (
    "id"                TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "terms"             JSONB NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalInvoiceId" TEXT NOT NULL,
    "newInvoiceId"      TEXT,
    "tenantId"          TEXT NOT NULL,
    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Agreement_originalInvoiceId_idx"        ON "Agreement"("originalInvoiceId");
CREATE INDEX IF NOT EXISTS "Agreement_tenantId_idx"                 ON "Agreement"("tenantId");
CREATE INDEX IF NOT EXISTS "Agreement_originalInvoiceId_status_idx" ON "Agreement"("originalInvoiceId", "status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agreement_newInvoiceId_key') THEN
        ALTER TABLE "Agreement"
            ADD CONSTRAINT "Agreement_newInvoiceId_key" UNIQUE ("newInvoiceId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agreement_originalInvoiceId_fkey') THEN
        ALTER TABLE "Agreement"
            ADD CONSTRAINT "Agreement_originalInvoiceId_fkey"
            FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agreement_newInvoiceId_fkey') THEN
        ALTER TABLE "Agreement"
            ADD CONSTRAINT "Agreement_newInvoiceId_fkey"
            FOREIGN KEY ("newInvoiceId") REFERENCES "Invoice"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
