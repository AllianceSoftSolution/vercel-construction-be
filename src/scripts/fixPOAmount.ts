/**
 * Fix script: Revert a PO's unit price and recalculate vendor account totals.
 *
 * Usage:
 *   npx ts-node src/scripts/fixPOAmount.ts <poReferenceOrId> <correctUnitPrice>
 *
 * Example:
 *   npx ts-node src/scripts/fixPOAmount.ts PO-2026-0042 500
 *
 * The script will print what it found and what it will change, then ask for
 * confirmation before writing anything to the database.
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

const prisma = new PrismaClient();

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  const [poIdentifier, unitPriceStr] = process.argv.slice(2);

  if (!poIdentifier || !unitPriceStr) {
    console.error("Usage: npx ts-node src/scripts/fixPOAmount.ts <poReferenceOrId> <correctUnitPrice>");
    process.exit(1);
  }

  const correctUnitPrice = parseFloat(unitPriceStr);
  if (isNaN(correctUnitPrice) || correctUnitPrice <= 0) {
    console.error("correctUnitPrice must be a positive number.");
    process.exit(1);
  }

  // Find PO by reference number or id
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      isDeleted: false,
      OR: [{ referenceNumber: poIdentifier }, { id: poIdentifier }],
    },
    include: {
      vendor: { select: { name: true } },
      material: { select: { name: true } },
    },
  });

  if (!po) {
    console.error(`No PO found with reference/id: "${poIdentifier}"`);
    process.exit(1);
  }

  const oldTotalAmount = Number(po.totalAmount || 0);
  const newTotalAmount = Number(po.quantity) * correctUnitPrice;
  const amountDifference = newTotalAmount - oldTotalAmount;

  console.log("\n─── PO Details ──────────────────────────────────────");
  console.log(`  Reference     : ${po.referenceNumber}`);
  console.log(`  Vendor        : ${po.vendor?.name ?? "-"}`);
  console.log(`  Material      : ${po.material?.name ?? "-"}`);
  console.log(`  Quantity      : ${po.quantity}`);
  console.log(`  Current price : ${po.unitPrice} Rs/unit  (total: ${oldTotalAmount} Rs)`);
  console.log(`  Correct price : ${correctUnitPrice} Rs/unit  (total: ${newTotalAmount} Rs)`);
  console.log(`  Difference    : ${amountDifference >= 0 ? "+" : ""}${amountDifference} Rs`);
  console.log("─────────────────────────────────────────────────────\n");

  // Find the vendor account
  const vendorAccount = await prisma.vendorAccount.findUnique({
    where: { vendorId: po.vendorId },
  });

  if (!vendorAccount) {
    console.error("VendorAccount not found for this vendor.");
    process.exit(1);
  }

  // Preview vendor account changes
  const allCurrentCredits = await prisma.vendorAccountTransaction.aggregate({
    where: { vendorAccountId: vendorAccount.id, type: "CREDIT" },
    _sum: { amount: true },
  });
  const allCurrentDebits = await prisma.vendorAccountTransaction.aggregate({
    where: { vendorAccountId: vendorAccount.id, type: "DEBIT" },
    _sum: { amount: true },
  });
  const currentTotalCredited = Number(allCurrentCredits._sum.amount || 0);
  const totalDebited = Number(allCurrentDebits._sum.amount || 0);
  const newTotalCredited = currentTotalCredited - oldTotalAmount + newTotalAmount;
  const newBalance = newTotalCredited - totalDebited;

  console.log("─── Vendor Account Impact ───────────────────────────");
  console.log(`  totalCredited : ${currentTotalCredited} Rs  →  ${newTotalCredited} Rs`);
  console.log(`  totalDebited  : ${totalDebited} Rs  (unchanged)`);
  console.log(`  balance       : ${currentTotalCredited - totalDebited} Rs  →  ${newBalance} Rs`);
  console.log("─────────────────────────────────────────────────────\n");

  const answer = await prompt("Proceed? (yes/no): ");
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Aborted — no changes made.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Apply the fix in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update the PO
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        unitPrice: correctUnitPrice,
        totalAmount: newTotalAmount,
        amountLastEditedAt: new Date(),
      },
    });

    // 2. Update the CREDIT transaction for this PO
    const creditTx = await tx.vendorAccountTransaction.findFirst({
      where: { vendorAccountId: vendorAccount.id, purchaseOrderId: po.id, type: "CREDIT" },
    });
    if (creditTx) {
      await tx.vendorAccountTransaction.update({
        where: { id: creditTx.id },
        data: { amount: newTotalAmount },
      });
    } else {
      console.warn("Warning: no CREDIT transaction found for this PO — vendor account may be inconsistent.");
    }

    // 3. Recalculate totalCredited from scratch after updating the transaction
    const freshCredits = await tx.vendorAccountTransaction.aggregate({
      where: { vendorAccountId: vendorAccount.id, type: "CREDIT" },
      _sum: { amount: true },
    });
    const freshDebits = await tx.vendorAccountTransaction.aggregate({
      where: { vendorAccountId: vendorAccount.id, type: "DEBIT" },
      _sum: { amount: true },
    });
    const freshCredited = Number(freshCredits._sum.amount || 0);
    const freshDebited = Number(freshDebits._sum.amount || 0);

    // 4. Update VendorAccount
    await tx.vendorAccount.update({
      where: { id: vendorAccount.id },
      data: {
        totalCredited: freshCredited,
        totalDebited: freshDebited,
        balance: freshCredited - freshDebited,
      },
    });
  });

  console.log("\n✓ Fix applied successfully.");
  console.log(`  PO ${po.referenceNumber} unit price: ${po.unitPrice} → ${correctUnitPrice} Rs`);
  console.log(`  VendorAccount totalCredited: ${currentTotalCredited} → ${newTotalCredited} Rs`);
  console.log(`  Balance: ${currentTotalCredited - totalDebited} → ${newBalance} Rs`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
