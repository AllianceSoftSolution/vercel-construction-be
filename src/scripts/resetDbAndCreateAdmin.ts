import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';

async function main() {
  // 1. Delete all data in the correct order to avoid FK errors
  // Order: DeviceToken, AuditLog, VendorAccountTransaction, VendorPayment, VendorAccount, StoreTransaction, StoreInventory, DemandFulfillment, DemandApproval, PurchaseOrder, Demand, Material, StoreInchargeAssignment, AccountantAssignment, ConstructionManagerAssignment, ProjectManagerAssignment, SiteInchargeAssignment, Store, Section, Project, Vendor, ReferenceCounter, OTP, User
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
  await prisma.demand.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.storeInchargeAssignment.deleteMany({});
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
  await prisma.user.deleteMany({});

  // 2. Create only the admin user
  const adminEmail = 'heyahmadhassan@gmail.com';
  const adminPassword = bcrypt.hashSync('admin123', 10); // You can change this default password
  await prisma.user.create({
    data: {
      name: 'Admin User',
      email: adminEmail,
      password: adminPassword,
      employeeId: 'EMP-ADMIN',
      role: UserRole.ADMIN,
      isActive: true,
      isDeleted: false,
    },
  });
  console.log('Database reset. Admin user created:', adminEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 