-- Índice para a lista de faturas pendentes: filtra por (tenantId, status) e
-- ordena por dueDate. O composto permite ao Postgres servir filtro + ORDER BY
-- sem um passo de sort. Idempotente (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_dueDate_idx"
    ON "Invoice"("tenantId", "status", "dueDate");
