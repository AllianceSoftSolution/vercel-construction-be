"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../utils/prisma"));
async function main() {
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
    await prisma_1.default.demand.deleteMany({});
    await prisma_1.default.material.deleteMany({});
    await prisma_1.default.storeInchargeAssignment.deleteMany({});
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
    await prisma_1.default.user.deleteMany({});
    const adminEmail = 'heyahmadhassan@gmail.com';
    const adminPassword = bcryptjs_1.default.hashSync('admin123', 10);
    await prisma_1.default.user.create({
        data: {
            name: 'Admin User',
            email: adminEmail,
            password: adminPassword,
            employeeId: 'EMP-ADMIN',
            role: client_1.UserRole.ADMIN,
            isActive: true,
            isDeleted: false,
        },
    });
    console.log('Database reset. Admin user created:', adminEmail);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=resetDbAndCreateAdmin.js.map