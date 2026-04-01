/**
 * One-time migration script: Backfill project_id on VendorPayment and
 * VendorAccountTransaction records that were created before the projectId
 * column was added.
 *
 * Strategy:
 *  1. For each VendorPayment where projectId IS NULL:
 *     - Find Purchase Orders for the same vendor that were CONFIRMED
 *       (i.e. have an amount, meaning a payment was made against them).
 *     - If exactly one distinct project is involved → assign that projectId.
 *     - If multiple projects → flag the payment as needs_review = true.
 *     - If no PO found → flag as needs_review = true.
 *  2. Mirror the same projectId onto the linked VendorAccountTransaction (DEBIT).
 *  3. After migration, a NOT NULL constraint migration is printed to stdout
 *     so it can be added to the Prisma schema manually.
 *
 * Run with:
 *   npx ts-node src/scripts/backfillPaymentProjectIds.ts
 */

import prisma from '../utils/prisma';

async function main() {
  console.log('=== Starting payment project_id backfill ===\n');

  // ── 1. Check if needs_review column exists; if not, add it via raw SQL first ──
  // We use a try/catch so the script is idempotent even if the column already exists.
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "needs_review" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('[schema] Added needs_review column to vendor_payments (or it already existed).\n');
  } catch (e: any) {
    console.warn('[schema] Could not auto-add needs_review column:', e.message);
    console.warn('         If the column does not exist, add it manually and re-run.\n');
  }

  // ── 2. Fetch all VendorPayments with null projectId ──────────────────────────
  const nullPayments = await prisma.$queryRawUnsafe<Array<{
    id: string;
    vendorId: string;
    amount: string;
    createdAt: Date;
  }>>(
    `SELECT id, "vendorId", amount::text, "createdAt" FROM vendor_payments WHERE "projectId" IS NULL`
  );

  console.log(`Found ${nullPayments.length} payments with NULL projectId.\n`);

  let fixed = 0;
  let flagged = 0;
  let skipped = 0;

  for (const payment of nullPayments) {
    // Find POs for this vendor that were confirmed (have a unit price / total amount set)
    const vendorPOs = await prisma.purchaseOrder.findMany({
      where: {
        vendorId: payment.vendorId,
        isDeleted: false,
        unitPrice: { not: null }, // means a CREDIT transaction was already created
      },
      select: { id: true, projectId: true, amountAddedAt: true, createdAt: true },
    });

    if (vendorPOs.length === 0) {
      // No PO evidence at all — flag for manual review
      await prisma.$executeRawUnsafe(
        `UPDATE vendor_payments SET needs_review = true WHERE id = $1`,
        payment.id
      );
      console.log(`[flagged — no POs] payment ${payment.id}`);
      flagged++;
      continue;
    }

    // Determine the closest PO by comparing dates
    // Sort POs by how close their amountAddedAt (or createdAt) is to the payment date
    const paymentTime = new Date(payment.createdAt).getTime();
    const sortedPOs = [...vendorPOs].sort((a, b) => {
      const aTime = new Date(a.amountAddedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.amountAddedAt ?? b.createdAt).getTime();
      return Math.abs(aTime - paymentTime) - Math.abs(bTime - paymentTime);
    });

    // Collect distinct projectIds from all POs for this vendor
    const distinctProjectIds = [...new Set(vendorPOs.map(po => po.projectId))];

    if (distinctProjectIds.length === 1) {
      // Unambiguous — single project
      const projectId = distinctProjectIds[0];
      await prisma.$executeRawUnsafe(
        `UPDATE vendor_payments SET "projectId" = $1 WHERE id = $2`,
        projectId,
        payment.id
      );

      // Also patch the linked VendorAccountTransaction (DEBIT entry)
      await prisma.$executeRawUnsafe(
        `UPDATE "VendorAccountTransaction"
         SET "projectId" = $1
         WHERE "vendorPaymentId" = $2 AND "projectId" IS NULL`,
        projectId,
        payment.id
      );

      console.log(`[fixed — single project] payment ${payment.id} → project ${projectId}`);
      fixed++;
    } else {
      // Multiple projects — use the closest PO's project but mark for review
      const bestProjectId = sortedPOs[0].projectId;
      await prisma.$executeRawUnsafe(
        `UPDATE vendor_payments SET "projectId" = $1, needs_review = true WHERE id = $2`,
        bestProjectId,
        payment.id
      );

      await prisma.$executeRawUnsafe(
        `UPDATE "VendorAccountTransaction"
         SET "projectId" = $1
         WHERE "vendorPaymentId" = $2 AND "projectId" IS NULL`,
        bestProjectId,
        payment.id
      );

      console.log(`[flagged — ambiguous (${distinctProjectIds.length} projects, best-guess ${bestProjectId})] payment ${payment.id}`);
      flagged++;
    }
  }

  console.log(`\n=== Backfill complete ===`);
  console.log(`  Fixed (unambiguous):  ${fixed}`);
  console.log(`  Flagged (needs review): ${flagged}`);
  console.log(`  Skipped:              ${skipped}`);

  // ── 3. Verify: how many remain NULL? ─────────────────────────────────────
  const remaining = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count FROM vendor_payments WHERE "projectId" IS NULL AND needs_review = false`
  );
  console.log(`\n  Payments still NULL (not yet reviewed): ${remaining[0]?.count ?? '?'}`);

  // ── 4. Print Prisma schema changes to add to schema.prisma manually ───────
  console.log(`
=== NEXT STEPS ===

1. Review the flagged payments manually (needs_review = true) and assign
   their projectId correctly.

2. Once all values are filled, add NOT NULL constraint by updating schema.prisma:

   model VendorPayment {
     ...
     projectId  String   // Remove the ? to make it NOT NULL
     ...
   }

   Then run:  npx prisma migrate dev --name enforce_payment_project_id_not_null

3. Do the same for VendorAccountTransaction.projectId if all DEBIT rows are now filled.
`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
