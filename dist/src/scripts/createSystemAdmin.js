"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = "heyahmadhassan@gmail.com";
    const plainPassword = "admin1234";
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`User ${email} already exists. Skipping.`);
        return;
    }
    const hashedPassword = await bcryptjs_1.default.hash(plainPassword, 10);
    const user = await prisma.user.create({
        data: {
            name: "System Admin",
            email,
            password: hashedPassword,
            employeeId: "ADMIN-001",
            role: "ADMIN",
            isHead: true,
            createdBy: "system",
        },
    });
    console.log(`✓ Admin user created: ${user.email} (id: ${user.id})`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=createSystemAdmin.js.map