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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const prisma = new client_1.PrismaClient();
const ROLE_PASSWORDS = {
    SUPER_ADMIN: "SuperAdmin@2026",
    ADMIN: "Admin@2026",
    SUB_ADMIN: "SubAdmin@2026",
    SITE_INCHARGE: "SiteIncharge@2026",
    PROJECT_MANAGER: "ProjectManager@2026",
    CONSTRUCTION_MANAGER: "ConstructionManager@2026",
    STORE_INCHARGE: "StoreIncharge@2026",
    ACCOUNTANT: "Accountant@2026",
};
const BCRYPT_ROUNDS = 12;
async function main() {
    console.log("=".repeat(60));
    console.log("  LIVE DB – Bulk Password Reset");
    console.log("=".repeat(60));
    const users = await prisma.user.findMany({
        where: { isDeleted: false },
        select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            role: true,
            isActive: true,
            isHead: true,
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    if (users.length === 0) {
        console.log("No users found in the database. Exiting.");
        return;
    }
    console.log(`Found ${users.length} user(s). Starting password reset...\n`);
    const uniqueRoles = [...new Set(users.map((u) => u.role))];
    const hashedPasswords = {};
    for (const role of uniqueRoles) {
        const plain = ROLE_PASSWORDS[role];
        hashedPasswords[role] = await bcryptjs_1.default.hash(plain, BCRYPT_ROUNDS);
        console.log(`  Hashed password for role: ${role}`);
    }
    await prisma.$transaction(users.map((user) => prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPasswords[user.role],
            updatedBy: "system-reset-script",
        },
    })));
    console.log(`\n✓ All ${users.length} user passwords updated successfully.\n`);
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(__dirname, "..", "..", "..", `credentials-${timestamp}.txt`);
    const separator = "-".repeat(80);
    const lines = [
        "=".repeat(80),
        "  CONSTRUCTION APP – UPDATED USER CREDENTIALS",
        `  Generated: ${now.toUTCString()}`,
        "  CONFIDENTIAL – Store securely and delete after distribution.",
        "=".repeat(80),
        "",
    ];
    const byRole = {};
    for (const user of users) {
        if (!byRole[user.role])
            byRole[user.role] = [];
        byRole[user.role].push(user);
    }
    for (const role of Object.keys(byRole).sort()) {
        const plainPwd = ROLE_PASSWORDS[role];
        lines.push(`ROLE: ${role}`);
        lines.push(`NEW PASSWORD FOR THIS ROLE: ${plainPwd}`);
        lines.push(separator);
        lines.push(`${"#".padEnd(4)} | ${"Name".padEnd(30)} | ${"Email".padEnd(40)} | ${"Employee ID".padEnd(15)} | Status`);
        lines.push(separator);
        byRole[role].forEach((user, idx) => {
            const status = user.isActive ? "Active" : "Inactive";
            const headFlag = user.isHead ? " [HEAD]" : "";
            lines.push(`${String(idx + 1).padEnd(4)} | ${(user.name + headFlag).padEnd(30)} | ${user.email.padEnd(40)} | ${user.employeeId.padEnd(15)} | ${status}`);
        });
        lines.push("");
    }
    lines.push("=".repeat(80));
    lines.push("  END OF REPORT");
    lines.push("=".repeat(80));
    fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
    console.log(`✓ Credentials document saved to:\n  ${outputPath}\n`);
    console.log("IMPORTANT: Distribute this file securely and delete it afterwards.");
}
main()
    .catch((err) => {
    console.error("\n✗ Script failed:", err);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=resetAllUserPasswords.js.map