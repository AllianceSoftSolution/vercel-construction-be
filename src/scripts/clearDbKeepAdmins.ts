import 'dotenv/config';
import { UserRole } from '@prisma/client';
import prisma from '../utils/prisma';

const PRESERVED_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SUB_ADMIN,
];

async function main() {
  const preservedUsers = await prisma.user.findMany({
    where: { role: { in: PRESERVED_ROLES } },
    select: { id: true, email: true, role: true },
  });

  console.log(`Preserving ${preservedUsers.length} admin user(s):`);
  preservedUsers.forEach((u) => console.log(`  - [${u.role}] ${u.email}`));

  await prisma.deviceToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.vendorAccountTransaction.deleteMany({});
  await prisma.vendorPayment.deleteMany({});
  await prisma.vendorAccount.deleteMany({});
  await prisma.storeTransaction.deleteMany({});
  await prisma.storeInventory.deleteMany({});
  await prisma.demandFulfillment.deleteMany({});
  await prisma.demandApproval.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.materialCap.deleteMany({});
  await prisma.demand.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.storePermission.deleteMany({});
  await prisma.storeInchargeAssignment.deleteMany({});
  await prisma.headStoreInchargeAssignment.deleteMany({});
  await prisma.accountantAssignment.deleteMany({});
  await prisma.constructionManagerAssignment.deleteMany({});
  await prisma.projectManagerAssignment.deleteMany({});
  await prisma.siteInchargeAssignment.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.section.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.referenceCounter.deleteMany({});
  await prisma.oTP.deleteMany({});

  await prisma.user.updateMany({
    where: { role: { in: PRESERVED_ROLES } },
    data: { createdBy: null, updatedBy: null },
  });

  const deleted = await prisma.user.deleteMany({
    where: { role: { notIn: PRESERVED_ROLES } },
  });

  console.log(`\nDeleted ${deleted.count} non-admin user(s).`);
  console.log('Database cleared. Admin users preserved.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
