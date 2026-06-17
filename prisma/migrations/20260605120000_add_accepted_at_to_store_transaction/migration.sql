-- Incoming transfer stock is applied only after accept; backfill legacy rows.
ALTER TABLE "store_transactions" ADD COLUMN "acceptedAt" TIMESTAMP(3);

UPDATE "store_transactions"
SET "acceptedAt" = "transactionDate"
WHERE "type" = 'IN' AND "fromStoreId" IS NOT NULL;
