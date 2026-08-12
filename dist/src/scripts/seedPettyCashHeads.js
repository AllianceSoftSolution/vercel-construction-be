"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = __importDefault(require("../utils/prisma"));
const DEFAULT_HEADS = [
    "Utility Bills",
    "Lunch",
    "Groceries",
    "Chai & Refreshments",
    "Transport",
    "Stationery",
    "Maintenance",
    "Miscellaneous",
];
async function main() {
    const admin = await prisma_1.default.user.findFirst({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
    });
    const createdBy = admin?.id || "system";
    for (const name of DEFAULT_HEADS) {
        const existing = await prisma_1.default.pettyCashExpenseHead.findFirst({
            where: { name, isDeleted: false },
        });
        if (!existing) {
            await prisma_1.default.pettyCashExpenseHead.create({
                data: { name, createdBy },
            });
            console.log(`Created expense head: ${name}`);
        }
        else {
            console.log(`Exists: ${name}`);
        }
    }
}
main()
    .catch(console.error)
    .finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=seedPettyCashHeads.js.map