"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const PRESERVED_ROLES = [
    client_1.UserRole.SUPER_ADMIN,
    client_1.UserRole.ADMIN,
    client_1.UserRole.SUB_ADMIN,
];
async function main() {
    const preservedUsers = await prisma_1.default.user.findMany({
        where: { role: { in: PRESERVED_ROLES } },
        select: { id: true, email: true, role: true },
    });
    console.log(`Preserving ${preservedUsers.length} admin user(s):`);
    preservedUsers.forEach((u) => console.log(`  - [${u.role}] ${u.email}`));
    await prisma_1.default.deviceToken.deleteMany({});
    await prisma_1.default.auditLog.deleteMany({});
    await prisma_1.default.vendorAccountTransaction.deleteMany({});
    await prisma_1.default.vendorPayment.deleteMany({});
    await prisma_1.default.vendorAccount.deleteMany({});
    await prisma_1.default.storeTransaction.deleteMany({});
    await prisma_1.default.storeInventory.deleteMany({});
    await prisma_1.default.demandFulfillment.deleteMany({});
    await prisma_1.default.demandApproval.deleteMany({});
    await prisma_1.default.purchaseOrder.deleteMany({});
    await prisma_1.default.materialCap.deleteMany({});
    await prisma_1.default.demand.deleteMany({});
    await prisma_1.default.material.deleteMany({});
    await prisma_1.default.storePermission.deleteMany({});
    await prisma_1.default.storeInchargeAssignment.deleteMany({});
    await prisma_1.default.headStoreInchargeAssignment.deleteMany({});
    await prisma_1.default.accountantAssignment.deleteMany({});
    await prisma_1.default.constructionManagerAssignment.deleteMany({});
    await prisma_1.default.projectManagerAssignment.deleteMany({});
    await prisma_1.default.siteInchargeAssignment.deleteMany({});
    await prisma_1.default.store.deleteMany({});
    await prisma_1.default.section.deleteMany({});
    await prisma_1.default.project.deleteMany({});
    await prisma_1.default.vendor.deleteMany({});
    await prisma_1.default.referenceCounter.deleteMany({});
    await prisma_1.default.oTP.deleteMany({});
    await prisma_1.default.user.updateMany({
        where: { role: { in: PRESERVED_ROLES } },
        data: { createdBy: null, updatedBy: null },
    });
    const deleted = await prisma_1.default.user.deleteMany({
        where: { role: { notIn: PRESERVED_ROLES } },
    });
    console.log(`\nDeleted ${deleted.count} non-admin user(s).`);
    console.log('Database cleared. Admin users preserved.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=clearDbKeepAdmins.js.map