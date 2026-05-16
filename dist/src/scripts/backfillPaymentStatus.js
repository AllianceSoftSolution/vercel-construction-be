"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../utils/prisma"));
async function main() {
    console.log("Starting paymentStatus backfill...");
    const poGroups = await prisma_1.default.purchaseOrder.groupBy({
        by: ["vendorId", "projectId"],
        where: { isDeleted: false, totalAmount: { not: null }, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true },
    });
    console.log(`Found ${poGroups.length} vendor+project combinations to process.`);
    const paymentGroups = await prisma_1.default.vendorPayment.groupBy({
        by: ["vendorId", "projectId"],
        _sum: { amount: true },
    });
    const paidMap = new Map();
    for (const pg of paymentGroups) {
        if (pg.projectId) {
            paidMap.set(`${pg.vendorId}:${pg.projectId}`, Number(pg._sum.amount || 0));
        }
    }
    let updated = 0;
    for (const group of poGroups) {
        const totalPOAmount = Number(group._sum.totalAmount || 0);
        const totalPaid = paidMap.get(`${group.vendorId}:${group.projectId}`) ?? 0;
        let newStatus = "PENDING";
        if (totalPOAmount > 0 && totalPaid >= totalPOAmount) {
            newStatus = "FULLY_PAID";
        }
        else if (totalPaid > 0) {
            newStatus = "PARTIALLY_PAID";
        }
        if (newStatus !== "PENDING") {
            await prisma_1.default.purchaseOrder.updateMany({
                where: {
                    vendorId: group.vendorId,
                    projectId: group.projectId,
                    isDeleted: false,
                    totalAmount: { not: null },
                    status: { not: "CANCELLED" },
                },
                data: { paymentStatus: newStatus },
            });
            console.log(`  vendor=${group.vendorId} project=${group.projectId} → ${newStatus} (paid=${totalPaid}, total=${totalPOAmount})`);
            updated++;
        }
    }
    console.log(`\nBackfill complete. Updated ${updated} vendor+project group(s).`);
    await prisma_1.default.$disconnect();
}
main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
//# sourceMappingURL=backfillPaymentStatus.js.map