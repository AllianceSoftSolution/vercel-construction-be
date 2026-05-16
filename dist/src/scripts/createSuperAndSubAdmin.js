"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const USERS = [
    {
        name: "Super Admin",
        email: "superadmin@radc.com",
        plainPassword: "SuperAdmin@2026",
        employeeId: "SADMIN-001",
        role: "SUPER_ADMIN",
    },
    {
        name: "Sub Admin",
        email: "subadmin@radc.com",
        plainPassword: "SubAdmin@2026",
        employeeId: "SUBADMIN-001",
        role: "SUB_ADMIN",
    },
];
async function main() {
    for (const u of USERS) {
        const existing = await prisma.user.findUnique({ where: { email: u.email } });
        if (existing) {
            console.log(`⚠  ${u.email} already exists — skipping.`);
            continue;
        }
        const hashedPassword = await bcryptjs_1.default.hash(u.plainPassword, 10);
        const created = await prisma.user.create({
            data: {
                name: u.name,
                email: u.email,
                password: hashedPassword,
                employeeId: u.employeeId,
                role: u.role,
                isHead: true,
                createdBy: null,
            },
        });
        console.log(`✓ Created [${created.role}] ${created.name} <${created.email}> (id: ${created.id})`);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=createSuperAndSubAdmin.js.map