/**
 * resetAllUserPasswords.ts
 *
 * LIVE DB credential reset script.
 * - Fetches all non-deleted users (active + inactive).
 * - Assigns a role-based password to each user.
 * - Updates the hashed password in DB atomically via a transaction.
 * - Writes a plain-text credentials report to the project root.
 *
 * Usage (from construction-be root):
 *   npx tsx src/scripts/resetAllUserPasswords.ts
 */

import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/** Role → plain-text password mapping */
const ROLE_PASSWORDS: Record<UserRole, string> = {
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

  // 1. Fetch all non-deleted users (active + inactive)
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

  // 2. Pre-hash one password per unique role (avoid re-hashing the same value repeatedly)
  const uniqueRoles = [...new Set(users.map((u) => u.role))] as UserRole[];
  const hashedPasswords: Record<string, string> = {};

  for (const role of uniqueRoles) {
    const plain = ROLE_PASSWORDS[role];
    hashedPasswords[role] = await bcrypt.hash(plain, BCRYPT_ROUNDS);
    console.log(`  Hashed password for role: ${role}`);
  }

  // 3. Update all users inside a single transaction (all-or-nothing)
  await prisma.$transaction(
    users.map((user) =>
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPasswords[user.role],
          updatedBy: "system-reset-script",
        },
      })
    )
  );

  console.log(`\n✓ All ${users.length} user passwords updated successfully.\n`);

  // 4. Build the credentials report
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    `credentials-${timestamp}.txt`
  );

  const separator = "-".repeat(80);

  const lines: string[] = [
    "=".repeat(80),
    "  CONSTRUCTION APP – UPDATED USER CREDENTIALS",
    `  Generated: ${now.toUTCString()}`,
    "  CONFIDENTIAL – Store securely and delete after distribution.",
    "=".repeat(80),
    "",
  ];

  // Group by role for readability
  const byRole: Record<string, typeof users> = {};
  for (const user of users) {
    if (!byRole[user.role]) byRole[user.role] = [];
    byRole[user.role].push(user);
  }

  for (const role of Object.keys(byRole).sort()) {
    const plainPwd = ROLE_PASSWORDS[role as UserRole];
    lines.push(`ROLE: ${role}`);
    lines.push(`NEW PASSWORD FOR THIS ROLE: ${plainPwd}`);
    lines.push(separator);
    lines.push(
      `${"#".padEnd(4)} | ${"Name".padEnd(30)} | ${"Email".padEnd(40)} | ${"Employee ID".padEnd(15)} | Status`
    );
    lines.push(separator);

    byRole[role].forEach((user, idx) => {
      const status = user.isActive ? "Active" : "Inactive";
      const headFlag = user.isHead ? " [HEAD]" : "";
      lines.push(
        `${String(idx + 1).padEnd(4)} | ${(user.name + headFlag).padEnd(30)} | ${user.email.padEnd(40)} | ${user.employeeId.padEnd(15)} | ${status}`
      );
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
