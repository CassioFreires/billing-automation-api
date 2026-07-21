-- Multi-gateway de pagamento (spec 0019). Aditiva e idempotente.
-- Guarda os segredos do provider (apiKey/token/secretKey/...) num JSON cifrado
-- em repouso (AES-256-GCM, prefixo enc:v1:), fora das colunas não-secretas.

ALTER TABLE "PaymentSetting" ADD COLUMN IF NOT EXISTS "credentialsEnc" TEXT;
