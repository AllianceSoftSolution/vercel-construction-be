/*
  Warnings:

  - A unique constraint covering the columns `[referenceNumber]` on the table `purchase_orders` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_referenceNumber_key" ON "purchase_orders"("referenceNumber");
