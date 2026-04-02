const bcrypt = require("../../node_modules/bcryptjs");
const { PrismaClient } = require("../../node_modules/@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Remove old admin if it exists
  await prisma.user.deleteMany({ where: { email: "heyahmadhassan@gmail.com" } });

  const email = "radcrustamadc@gmail.com";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists. Skipping.`);
    return;
  }

  const hash = bcrypt.hashSync("admin1234", 10);

  const user = await prisma.user.create({
    data: {
      name: "System Admin",
      email,
      password: hash,
      employeeId: "ADMIN-001",
      role: "ADMIN",
      isHead: true,
      createdBy: null,
    },
  });

  console.log("Admin user created successfully:");
  console.log("  Email   :", user.email);
  console.log("  ID      :", user.id);
  console.log("  Role    :", user.role);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
