-- AlterTable: add projectId to VendorPayment for project-level payment attribution
ALTER TABLE "VendorPayment" ADD COLUMN "projectId" TEXT;

-- AlterTable: add projectId to VendorAccountTransaction for project-scoped DEBIT filtering
ALTER TABLE "VendorAccountTransaction" ADD COLUMN "projectId" TEXT;
