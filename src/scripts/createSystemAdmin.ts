import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "heyahmadhassan@gmail.com";
  const plainPassword = "admin1234";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists. Skipping.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

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
