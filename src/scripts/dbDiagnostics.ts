import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const hostOverride = process.env.DB_HOST_OVERRIDE;
if (hostOverride && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /@([^:/]+)/,
    `@${hostOverride}`,
  );
  console.log(`Using DB_HOST_OVERRIDE: ${hostOverride}`);
}

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL || '';
  const match = url.match(/postgresql:\/\/([^:]+):[^@]+@([^:/]+):(\d+)\/([^?]+)/);
  if (match) {
    const [, user, host, port, db] = match;
    console.log(`DATABASE_URL -> user=${user}, host=${host}, port=${port}, database=${db}`);
  } else {
    console.log('DATABASE_URL format could not be parsed');
  }

  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    console.log('Connection: OK');
  } catch (e) {
    console.log('Connection: FAILED', (e as Error).message);
    return;
  }

  const counts = {
    users: await prisma.user.count(),
    projects: await prisma.project.count(),
    sections: await prisma.section.count(),
    stores: await prisma.store.count(),
    materials: await prisma.material.count(),
    demands: await prisma.demand.count(),
    vendors: await prisma.vendor.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('Table counts:', counts);

  const users = await prisma.user.findMany({
    select: { email: true, role: true, isActive: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  console.log('Sample users (first 10):', users);

  const adminCount = await prisma.user.count({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'SUB_ADMIN'] } },
  });
  console.log(`Admin-role users: ${adminCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
