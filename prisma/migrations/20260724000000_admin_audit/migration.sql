-- Painel super-admin (spec 0023): auditoria das ações do admin da plataforma.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id"             TEXT NOT NULL,
    "adminEmail"     TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "targetTenantId" TEXT NOT NULL,
    "meta"           JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetTenantId_idx" ON "AdminAuditLog"("targetTenantId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
