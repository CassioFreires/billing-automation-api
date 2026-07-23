-- Recuperação de pagamento falho (spec 0033 — F1 "Guardião da Receita").
-- Aditiva e idempotente.

-- Caso de recuperação: orbita UMA fatura vencida.
CREATE TABLE IF NOT EXISTS "RecoveryCase" (
    "id"             TEXT NOT NULL,
    "reason"         TEXT NOT NULL DEFAULT 'overdue',
    "status"         TEXT NOT NULL DEFAULT 'open',
    "amountAtRisk"   DECIMAL(12,2) NOT NULL,
    "currentStep"    INTEGER NOT NULL DEFAULT 0,
    "lastChannel"    TEXT,
    "reliefOffered"  BOOLEAN NOT NULL DEFAULT false,
    "nextActionAt"   TIMESTAMP(3),
    "openedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"     TIMESTAMP(3),
    "outcome"        TEXT,
    "lastUpdate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId"      TEXT NOT NULL,
    "clientId"       TEXT NOT NULL,
    "subscriptionId" TEXT,
    "tenantId"       TEXT NOT NULL,
    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryCase_invoiceId_key" ON "RecoveryCase"("invoiceId");
CREATE INDEX IF NOT EXISTS "RecoveryCase_tenantId_status_nextActionAt_idx" ON "RecoveryCase"("tenantId", "status", "nextActionAt");
CREATE INDEX IF NOT EXISTS "RecoveryCase_tenantId_status_idx" ON "RecoveryCase"("tenantId", "status");

-- Cada ação tomada num caso (auditoria da sequência).
CREATE TABLE IF NOT EXISTS "RecoveryAttempt" (
    "id"         TEXT NOT NULL,
    "step"       INTEGER NOT NULL,
    "channel"    TEXT,
    "action"     TEXT NOT NULL,
    "result"     TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId"     TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecoveryAttempt_tenantId_caseId_idx" ON "RecoveryAttempt"("tenantId", "caseId");

-- Foreign keys (guardadas para idempotência).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryCase_invoiceId_fkey') THEN
        ALTER TABLE "RecoveryCase"
            ADD CONSTRAINT "RecoveryCase_invoiceId_fkey"
            FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryCase_clientId_fkey') THEN
        ALTER TABLE "RecoveryCase"
            ADD CONSTRAINT "RecoveryCase_clientId_fkey"
            FOREIGN KEY ("clientId") REFERENCES "Client"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryCase_tenantId_fkey') THEN
        ALTER TABLE "RecoveryCase"
            ADD CONSTRAINT "RecoveryCase_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryAttempt_caseId_fkey') THEN
        ALTER TABLE "RecoveryAttempt"
            ADD CONSTRAINT "RecoveryAttempt_caseId_fkey"
            FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryAttempt_tenantId_fkey') THEN
        ALTER TABLE "RecoveryAttempt"
            ADD CONSTRAINT "RecoveryAttempt_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Account"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
