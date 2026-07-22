-- Prova de aceite dos Termos/Política no cadastro (spec 0022, LGPD). Aditiva e idempotente.

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "acceptedTermsAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "acceptedTermsVersion" TEXT;
