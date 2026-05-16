"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const readline = __importStar(require("readline"));
const prisma = new client_1.PrismaClient();
async function prompt(question) {
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
    const vendorAccount = await prisma.vendorAccount.findUnique({
        where: { vendorId: po.vendorId },
    });
    if (!vendorAccount) {
        console.error("VendorAccount not found for this vendor.");
        process.exit(1);
    }
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
    await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.update({
            where: { id: po.id },
            data: {
                unitPrice: correctUnitPrice,
                totalAmount: newTotalAmount,
                amountLastEditedAt: new Date(),
            },
        });
        const creditTx = await tx.vendorAccountTransaction.findFirst({
            where: { vendorAccountId: vendorAccount.id, purchaseOrderId: po.id, type: "CREDIT" },
        });
        if (creditTx) {
            await tx.vendorAccountTransaction.update({
                where: { id: creditTx.id },
                data: { amount: newTotalAmount },
            });
        }
        else {
            console.warn("Warning: no CREDIT transaction found for this PO — vendor account may be inconsistent.");
        }
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
//# sourceMappingURL=fixPOAmount.js.map