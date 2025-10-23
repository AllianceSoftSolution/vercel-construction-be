import { PrismaClient } from "@prisma/client";

// Create a singleton Prisma client with increased transaction timeout
const prisma = new PrismaClient({
  // Increase transaction timeout to 30 seconds
  transactionOptions: {
    timeout: 30000, // 30 seconds
  },
});

export default prisma;
