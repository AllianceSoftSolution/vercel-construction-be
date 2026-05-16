import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const USERS = [
  {
    name: "Super Admin",
    email: "superadmin@radc.com",
    plainPassword: "SuperAdmin@2026",
    employeeId: "SADMIN-001",
    role: "SUPER_ADMIN" as const,
  },
  {
    name: "Sub Admin",
    email: "subadmin@radc.com",
    plainPassword: "SubAdmin@2026",
    employeeId: "SUBADMIN-001",
    role: "SUB_ADMIN" as const,
  },
];

async function main() {
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`⚠  ${u.email} already exists — skipping.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(u.plainPassword, 10);

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
