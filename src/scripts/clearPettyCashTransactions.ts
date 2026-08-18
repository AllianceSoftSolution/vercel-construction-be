import "dotenv/config";
import prisma from "../utils/prisma";

async function main() {
  const result = await prisma.pettyCashTransaction.updateMany({
    where: { isDeleted: false },
    data: { isDeleted: true },
  });

  console.log(`Cleared ${result.count} petty cash transaction(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
