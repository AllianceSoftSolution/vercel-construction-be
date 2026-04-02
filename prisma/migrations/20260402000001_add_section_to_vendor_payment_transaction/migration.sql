-- AlterTable: add sectionId to VendorPayment for section-level payment attribution
ALTER TABLE "VendorPayment" ADD COLUMN "sectionId" TEXT;

-- AlterTable: add sectionId to VendorAccountTransaction for section-scoped DEBIT filtering
ALTER TABLE "VendorAccountTransaction" ADD COLUMN "sectionId" TEXT;
