import "dotenv/config";
import prisma from "../utils/prisma";

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
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
  });
  const createdBy = admin?.id || "system";

  for (const name of DEFAULT_HEADS) {
    const existing = await prisma.pettyCashExpenseHead.findFirst({
      where: { name, isDeleted: false },
    });
    if (!existing) {
      await prisma.pettyCashExpenseHead.create({
        data: { name, createdBy },
      });
      console.log(`Created expense head: ${name}`);
    } else {
      console.log(`Exists: ${name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
