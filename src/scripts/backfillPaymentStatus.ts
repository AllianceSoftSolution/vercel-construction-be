/**
 * One-time backfill: compute paymentStatus for all existing PurchaseOrders
 * based on actual VendorPayment records.
 *
 * Logic (per vendor + project):
 *   totalPOAmount  = SUM of PO.totalAmount  (non-null, non-cancelled, non-deleted)
 *   totalPaid      = SUM of VendorPayment.amount
 *
 *   totalPaid >= totalPOAmount  → FULLY_PAID
 *   totalPaid > 0               → PARTIALLY_PAID
 *   else                        → PENDING  (already the default – no write needed)
 */

import prisma from "../utils/prisma";

async function main() {
  console.log("Starting paymentStatus backfill...");

  // 1. Get all unique vendor+project combos that have at least one PO with amount
  const poGroups = await prisma.purchaseOrder.groupBy({
    by: ["vendorId", "projectId"],
    where: { isDeleted: false, totalAmount: { not: null }, status: { not: "CANCELLED" } },
    _sum: { totalAmount: true },
  });

  console.log(`Found ${poGroups.length} vendor+project combinations to process.`);

  // 2. Get all payment totals per vendor+project
  const paymentGroups = await prisma.vendorPayment.groupBy({
    by: ["vendorId", "projectId"],
    _sum: { amount: true },
  });

  // Build a lookup map: "vendorId:projectId" → totalPaid
  const paidMap = new Map<string, number>();
  for (const pg of paymentGroups) {
    if (pg.projectId) {
      paidMap.set(`${pg.vendorId}:${pg.projectId}`, Number(pg._sum.amount || 0));
    }
  }

  let updated = 0;

  // 3. For each vendor+project combo, determine and apply the paymentStatus
  for (const group of poGroups) {
    const totalPOAmount = Number(group._sum.totalAmount || 0);
    const totalPaid = paidMap.get(`${group.vendorId}:${group.projectId}`) ?? 0;

    let newStatus: "PENDING" | "PARTIALLY_PAID" | "FULLY_PAID" = "PENDING";
    if (totalPOAmount > 0 && totalPaid >= totalPOAmount) {
      newStatus = "FULLY_PAID";
    } else if (totalPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    }

    // Only write if not PENDING (default is already PENDING)
    if (newStatus !== "PENDING") {
      await prisma.purchaseOrder.updateMany({
        where: {
          vendorId: group.vendorId,
          projectId: group.projectId,
          isDeleted: false,
          totalAmount: { not: null },
          status: { not: "CANCELLED" },
        },
        data: { paymentStatus: newStatus },
      });
      console.log(
        `  vendor=${group.vendorId} project=${group.projectId} → ${newStatus} (paid=${totalPaid}, total=${totalPOAmount})`
      );
      updated++;
    }
  }

  console.log(`\nBackfill complete. Updated ${updated} vendor+project group(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
