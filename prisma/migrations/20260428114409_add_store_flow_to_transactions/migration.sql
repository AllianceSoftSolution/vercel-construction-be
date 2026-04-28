-- AlterTable
ALTER TABLE "store_transactions" ADD COLUMN     "fromStoreId" TEXT,
ADD COLUMN     "toStoreId" TEXT;

-- AddForeignKey
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
