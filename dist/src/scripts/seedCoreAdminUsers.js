"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const USERS = [
    {
        name: "System Admin [HEAD]",
        email: "radcrustamadc@gmail.com",
        plainPassword: "Admin@2026",
        employeeId: "ADMIN-001",
        role: "ADMIN",
        isHead: true,
    },
    {
        name: "Super Admin",
        email: "superadmin@radc.com",
        plainPassword: "SuperAdmin@2026",
        employeeId: "SADMIN-001",
        role: "SUPER_ADMIN",
        isHead: true,
    },
    {
        name: "Sub Admin",
        email: "subadmin@radc.com",
        plainPassword: "SubAdmin@2026",
        employeeId: "SUBADMIN-001",
        role: "SUB_ADMIN",
        isHead: true,
    },
];
async function main() {
    for (const user of USERS) {
        const hashedPassword = await bcryptjs_1.default.hash(user.plainPassword, 12);
        const existing = await prisma_1.default.user.findUnique({
            where: { email: user.email },
        });
        if (existing) {
            await prisma_1.default.user.update({
                where: { email: user.email },
                data: {
                    name: user.name,
                    password: hashedPassword,
                    role: user.role,
                    employeeId: user.employeeId,
                    isHead: user.isHead,
                    isActive: true,
                    isDeleted: false,
                },
            });
            console.log(`Updated [${user.role}] ${user.email}`);
            continue;
        }
        const employeeTaken = await prisma_1.default.user.findUnique({
            where: { employeeId: user.employeeId },
        });
        if (employeeTaken) {
            throw new Error(`Employee ID ${user.employeeId} is already used by ${employeeTaken.email}`);
        }
        await prisma_1.default.user.create({
            data: {
                name: user.name,
                email: user.email,
                password: hashedPassword,
                employeeId: user.employeeId,
                role: user.role,
                isHead: user.isHead,
                isActive: true,
                isDeleted: false,
            },
        });
        console.log(`Created [${user.role}] ${user.email}`);
    }
    const all = await prisma_1.default.user.findMany({
        select: { email: true, role: true, employeeId: true, isActive: true },
        orderBy: { role: "asc" },
    });
    console.log("\nAll users in database:");
    all.forEach((u) => console.log(`  - [${u.role}] ${u.email} (${u.employeeId})`));
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=seedCoreAdminUsers.js.map