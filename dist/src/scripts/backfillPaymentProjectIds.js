"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../utils/prisma"));
async function main() {
    console.log('=== Starting payment project_id backfill ===\n');
    try {
        await prisma_1.default.$executeRawUnsafe(`
      ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "needs_review" BOOLEAN NOT NULL DEFAULT false;
    `);
        console.log('[schema] Added needs_review column to vendor_payments (or it already existed).\n');
    }
    catch (e) {
        console.warn('[schema] Could not auto-add needs_review column:', e.message);
        console.warn('         If the column does not exist, add it manually and re-run.\n');
    }
    const nullPayments = await prisma_1.default.$queryRawUnsafe(`SELECT id, "vendorId", amount::text, "createdAt" FROM vendor_payments WHERE "projectId" IS NULL`);
    console.log(`Found ${nullPayments.length} payments with NULL projectId.\n`);
    let fixed = 0;
    let flagged = 0;
    let skipped = 0;
    for (const payment of nullPayments) {
        const vendorPOs = await prisma_1.default.purchaseOrder.findMany({
            where: {
                vendorId: payment.vendorId,
                isDeleted: false,
                unitPrice: { not: null },
            },
            select: { id: true, projectId: true, amountAddedAt: true, createdAt: true },
        });
        if (vendorPOs.length === 0) {
            await prisma_1.default.$executeRawUnsafe(`UPDATE vendor_payments SET needs_review = true WHERE id = $1`, payment.id);
            console.log(`[flagged — no POs] payment ${payment.id}`);
            flagged++;
            continue;
        }
        const paymentTime = new Date(payment.createdAt).getTime();
        const sortedPOs = [...vendorPOs].sort((a, b) => {
            const aTime = new Date(a.amountAddedAt ?? a.createdAt).getTime();
            const bTime = new Date(b.amountAddedAt ?? b.createdAt).getTime();
            return Math.abs(aTime - paymentTime) - Math.abs(bTime - paymentTime);
        });
        const distinctProjectIds = [...new Set(vendorPOs.map(po => po.projectId))];
        if (distinctProjectIds.length === 1) {
            const projectId = distinctProjectIds[0];
            await prisma_1.default.$executeRawUnsafe(`UPDATE vendor_payments SET "projectId" = $1 WHERE id = $2`, projectId, payment.id);
            await prisma_1.default.$executeRawUnsafe(`UPDATE "VendorAccountTransaction"
         SET "projectId" = $1
         WHERE "vendorPaymentId" = $2 AND "projectId" IS NULL`, projectId, payment.id);
            console.log(`[fixed — single project] payment ${payment.id} → project ${projectId}`);
            fixed++;
        }
        else {
            const bestProjectId = sortedPOs[0].projectId;
            await prisma_1.default.$executeRawUnsafe(`UPDATE vendor_payments SET "projectId" = $1, needs_review = true WHERE id = $2`, bestProjectId, payment.id);
            await prisma_1.default.$executeRawUnsafe(`UPDATE "VendorAccountTransaction"
         SET "projectId" = $1
         WHERE "vendorPaymentId" = $2 AND "projectId" IS NULL`, bestProjectId, payment.id);
            console.log(`[flagged — ambiguous (${distinctProjectIds.length} projects, best-guess ${bestProjectId})] payment ${payment.id}`);
            flagged++;
        }
    }
    console.log(`\n=== Backfill complete ===`);
    console.log(`  Fixed (unambiguous):  ${fixed}`);
    console.log(`  Flagged (needs review): ${flagged}`);
    console.log(`  Skipped:              ${skipped}`);
    const remaining = await prisma_1.default.$queryRawUnsafe(`SELECT COUNT(*)::text AS count FROM vendor_payments WHERE "projectId" IS NULL AND needs_review = false`);
    console.log(`\n  Payments still NULL (not yet reviewed): ${remaining[0]?.count ?? '?'}`);
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
    .finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=backfillPaymentProjectIds.js.map