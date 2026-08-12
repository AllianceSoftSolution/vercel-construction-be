-- CreateEnum
CREATE TYPE "PettyCashTransactionType" AS ENUM ('FUNDING', 'DISTRIBUTION', 'INTERNAL_EXPENSE', 'SECTION_EXPENSE');

-- CreateTable
CREATE TABLE "petty_cash_expense_heads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_expense_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash_transactions" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "type" "PettyCashTransactionType" NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "expenseHeadId" TEXT,
    "recipientUserId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "proofUrl" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "petty_cash_expense_heads_name_key" ON "petty_cash_expense_heads"("name");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_projectId_idx" ON "petty_cash_transactions"("projectId");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_sectionId_idx" ON "petty_cash_transactions"("sectionId");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_type_idx" ON "petty_cash_transactions"("type");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_createdAt_idx" ON "petty_cash_transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES "petty_cash_expense_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
