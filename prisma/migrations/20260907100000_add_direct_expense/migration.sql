-- Direct Expense ledger (isolated from petty cash).
-- AWS/prod: applied automatically by `prisma migrate deploy` during BE deploy
-- (`vercel-build` / Elastic Beanstalk). Existing expense heads stay PETTY_CASH.

-- CreateEnum
CREATE TYPE "ExpenseHeadKind" AS ENUM ('PETTY_CASH', 'DIRECT_EXPENSE');

-- AlterTable: add kind with default so existing heads stay PETTY_CASH
ALTER TABLE "petty_cash_expense_heads" ADD COLUMN "kind" "ExpenseHeadKind" NOT NULL DEFAULT 'PETTY_CASH';

-- Drop unique on name only
DROP INDEX IF EXISTS "petty_cash_expense_heads_name_key";

-- Unique per name + kind
CREATE UNIQUE INDEX "petty_cash_expense_heads_name_kind_key" ON "petty_cash_expense_heads"("name", "kind");

-- CreateTable
CREATE TABLE "direct_expense_transactions" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "expenseHeadId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "proofUrl" JSONB,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_expense_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "direct_expense_transactions_projectId_idx" ON "direct_expense_transactions"("projectId");
CREATE INDEX "direct_expense_transactions_sectionId_idx" ON "direct_expense_transactions"("sectionId");
CREATE INDEX "direct_expense_transactions_createdAt_idx" ON "direct_expense_transactions"("createdAt");

ALTER TABLE "direct_expense_transactions" ADD CONSTRAINT "direct_expense_transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_expense_transactions" ADD CONSTRAINT "direct_expense_transactions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "direct_expense_transactions" ADD CONSTRAINT "direct_expense_transactions_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES "petty_cash_expense_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_expense_transactions" ADD CONSTRAINT "direct_expense_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
