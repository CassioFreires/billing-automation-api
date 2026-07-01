-- Init: tabelas base Client e Invoice (estado ANTES da multi-tenancy).
-- Idempotente (IF NOT EXISTS) para ser segura em bancos já existentes:
-- em banco novo cria as tabelas; em banco antigo (criado via db push) é no-op.
-- Colunas adicionadas por migrations posteriores NÃO entram aqui:
--   tenantId    -> 20260701000000_multi_tenancy
--   checkoutUrl -> 20260701020000_payment_gateway
--   anonymizedAt-> 20260701030000_lgpd

-- Client (titular da cobrança)
CREATE TABLE IF NOT EXISTS "Client" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "phone"      TEXT NOT NULL,
    "document"   TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'EM_DIA',
    "debtValue"  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "processed"  BOOLEAN NOT NULL DEFAULT false,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- Telefone único globalmente (a multi_tenancy troca por (tenantId, phone))
CREATE UNIQUE INDEX IF NOT EXISTS "Client_phone_key" ON "Client"("phone");
CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status");

-- Invoice (fatura/cobrança)
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id"               TEXT NOT NULL,
    "value"            DOUBLE PRECISION NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "pixCopyPaste"     TEXT,
    "pixQrCode"        TEXT,
    "gatewayId"        TEXT,
    "dueDate"          TIMESTAMP(3) NOT NULL,
    "paidAt"           TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "clientId"         TEXT NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_gatewayId_key" ON "Invoice"("gatewayId");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_status_clientId_idx" ON "Invoice"("status", "clientId");

-- FK Invoice.clientId -> Client.id (guardada para idempotência)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_clientId_fkey') THEN
        ALTER TABLE "Invoice"
            ADD CONSTRAINT "Invoice_clientId_fkey"
            FOREIGN KEY ("clientId") REFERENCES "Client"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
