-- Dinheiro como NUMERIC(12,2) em vez de double precision (Float).
-- Float é ponto flutuante binário → erros de arredondamento inaceitáveis em
-- cobrança. NUMERIC é exato. Conversão preserva os valores existentes.
-- ALTER ... TYPE para o mesmo tipo é efetivamente idempotente (re-cast no-op).

ALTER TABLE "Invoice"
    ALTER COLUMN "value" TYPE NUMERIC(12,2) USING "value"::numeric;

ALTER TABLE "Subscription"
    ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING "amount"::numeric;

ALTER TABLE "InvoiceItem"
    ALTER COLUMN "unitPrice" TYPE NUMERIC(12,2) USING "unitPrice"::numeric;

ALTER TABLE "Client"
    ALTER COLUMN "debtValue" TYPE NUMERIC(12,2) USING "debtValue"::numeric,
    ALTER COLUMN "debtValue" SET DEFAULT 0.0;
