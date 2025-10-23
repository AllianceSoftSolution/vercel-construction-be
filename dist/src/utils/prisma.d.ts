import { PrismaClient } from "@prisma/client";
declare const prisma: PrismaClient<{
    transactionOptions: {
        timeout: number;
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export default prisma;
