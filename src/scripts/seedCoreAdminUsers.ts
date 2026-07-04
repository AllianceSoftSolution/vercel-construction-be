import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";

const USERS = [
  {
    name: "System Admin [HEAD]",
    email: "radcrustamadc@gmail.com",
    plainPassword: "Admin@2026",
    employeeId: "ADMIN-001",
    role: "ADMIN" as const,
    isHead: true,
  },
  {
    name: "Super Admin",
    email: "superadmin@radc.com",
    plainPassword: "SuperAdmin@2026",
    employeeId: "SADMIN-001",
    role: "SUPER_ADMIN" as const,
    isHead: true,
  },
  {
    name: "Sub Admin",
    email: "subadmin@radc.com",
    plainPassword: "SubAdmin@2026",
    employeeId: "SUBADMIN-001",
    role: "SUB_ADMIN" as const,
    isHead: true,
  },
];

async function main() {
  for (const user of USERS) {
    const hashedPassword = await bcrypt.hash(user.plainPassword, 12);
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existing) {
      await prisma.user.update({
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

    const employeeTaken = await prisma.user.findUnique({
      where: { employeeId: user.employeeId },
    });
    if (employeeTaken) {
      throw new Error(
        `Employee ID ${user.employeeId} is already used by ${employeeTaken.email}`,
      );
    }

    await prisma.user.create({
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

  const all = await prisma.user.findMany({
    select: { email: true, role: true, employeeId: true, isActive: true },
    orderBy: { role: "asc" },
  });
  console.log("\nAll users in database:");
  all.forEach((u) =>
    console.log(`  - [${u.role}] ${u.email} (${u.employeeId})`),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
