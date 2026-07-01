-- Gateway de pagamento + idempotência do webhook (spec 0003). Aditiva e idempotente.

-- URL de checkout hospedado (ex.: Mercado Pago Checkout Pro)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;

-- Idempotência: ids de evento de webhook já processados
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id"         TEXT NOT NULL,
    "provider"   TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
