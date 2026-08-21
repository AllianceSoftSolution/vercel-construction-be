-- Convert attachment URL columns from TEXT to JSON arrays (string[])

ALTER TABLE "store_incharge_assignments"
  ALTER COLUMN "utilityFile" TYPE JSONB
  USING CASE
    WHEN "utilityFile" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["utilityFile"])
  END;

ALTER TABLE "purchase_orders"
  ALTER COLUMN "proofOfBill" TYPE JSONB
  USING CASE
    WHEN "proofOfBill" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["proofOfBill"])
  END;

ALTER TABLE "store_transactions"
  ALTER COLUMN "documentUrl" TYPE JSONB
  USING CASE
    WHEN "documentUrl" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["documentUrl"])
  END;

ALTER TABLE "vendor_account_transactions"
  ALTER COLUMN "proofOfPayment" TYPE JSONB
  USING CASE
    WHEN "proofOfPayment" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["proofOfPayment"])
  END;

ALTER TABLE "vendor_payments"
  ALTER COLUMN "proofOfPayment" TYPE JSONB
  USING CASE
    WHEN "proofOfPayment" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["proofOfPayment"])
  END;

ALTER TABLE "petty_cash_transactions"
  ALTER COLUMN "proofUrl" TYPE JSONB
  USING CASE
    WHEN "proofUrl" IS NULL THEN NULL
    ELSE to_jsonb(ARRAY["proofUrl"])
  END;
