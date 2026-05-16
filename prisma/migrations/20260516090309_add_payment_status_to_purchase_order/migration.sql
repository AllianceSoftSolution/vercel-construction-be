-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
