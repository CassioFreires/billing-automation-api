-- Contrato como arquivo/PDF (spec 0041). Aditiva e idempotente.

ALTER TABLE "ContractSetting" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "ContractSetting" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "ContractSetting" ADD COLUMN IF NOT EXISTS "fileMime" TEXT;
ALTER TABLE "ContractSetting" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "ContractSetting" ADD COLUMN IF NOT EXISTS "fileData" BYTEA;
