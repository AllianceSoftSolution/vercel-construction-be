import { UserRole, StoreType, DemandStatus, Section, Project, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';

async function main() {
  // 1. Create Admin
  const adminEmail = 'admin@example.com';
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Admin User',
      email: adminEmail,
      password: bcrypt.hashSync('admin123', 10),
      employeeId: 'EMP-ADMIN',
      role: UserRole.ADMIN,
      isActive: true,
      isDeleted: false,
    },
  });
  console.log('Admin:', admin.email);

  // 2. Create Projects
  const projectData = [
    { code: 'PROJ-001', name: 'Alpha Project' },
    { code: 'PROJ-002', name: 'Beta Project' },
    { code: 'PROJ-003', name: 'Gamma Project' },
  ];
  const projects: Project[] = [];
  for (const p of projectData) {
    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {},
      create: {
        name: p.name,
        code: p.code,
        description: `Description for ${p.name}`,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    projects.push(project);
  }
  console.log('Projects:', projects.map(p => p.code));

  // 3. Create Sections for each project
  const allSections: Section[] = [];
  for (const project of projects) {
    for (let i = 1; i <= 3; i++) {
      const section = await prisma.section.upsert({
        where: { projectId_code: { projectId: project.id, code: `SEC-${i.toString().padStart(3, '0')}` } },
        update: {},
        create: {
          name: `Section ${i} of ${project.name}`,
          code: `SEC-${i.toString().padStart(3, '0')}`,
          projectId: project.id,
          isActive: true,
          isDeleted: false,
          createdBy: admin.id,
        },
      });
      allSections.push(section);
    }
  }
  console.log('Sections:', allSections.length);

  // 4. Create users for each role
  const siteIncharges: User[] = [];
  for (let i = 1; i <= 3; i++) {
    const user = await prisma.user.upsert({
      where: { email: `site${i}@example.com` },
      update: {},
      create: {
        name: `Site Incharge ${i}`,
        email: `site${i}@example.com`,
        password: bcrypt.hashSync('site123', 10),
        employeeId: `EMP-SI-${i}`,
        role: UserRole.SITE_INCHARGE,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    siteIncharges.push(user);
  }
  const projectManagers: User[] = [];
  for (let i = 1; i <= 2; i++) {
    const user = await prisma.user.upsert({
      where: { email: `pm${i}@example.com` },
      update: {},
      create: {
        name: `Project Manager ${i}`,
        email: `pm${i}@example.com`,
        password: bcrypt.hashSync('pm123', 10),
        employeeId: `EMP-PM-${i}`,
        role: UserRole.PROJECT_MANAGER,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    projectManagers.push(user);
  }
  const constructionManagers: User[] = [];
  for (let i = 1; i <= 2; i++) {
    const user = await prisma.user.upsert({
      where: { email: `cm${i}@example.com` },
      update: {},
      create: {
        name: `Construction Manager ${i}`,
        email: `cm${i}@example.com`,
        password: bcrypt.hashSync('cm123', 10),
        employeeId: `EMP-CM-${i}`,
        role: UserRole.CONSTRUCTION_MANAGER,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    constructionManagers.push(user);
  }
  const accountants: User[] = [];
  for (let i = 1; i <= 2; i++) {
    const user = await prisma.user.upsert({
      where: { email: `accountant${i}@example.com` },
      update: {},
      create: {
        name: `Accountant ${i}`,
        email: `accountant${i}@example.com`,
        password: bcrypt.hashSync('acc123', 10),
        employeeId: `EMP-ACC-${i}`,
        role: UserRole.ACCOUNTANT,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    accountants.push(user);
  }
  const storeIncharges: User[] = [];
  for (let i = 1; i <= 2; i++) {
    const user = await prisma.user.upsert({
      where: { email: `storeincharge${i}@example.com` },
      update: {},
      create: {
        name: `Store Incharge ${i}`,
        email: `storeincharge${i}@example.com`,
        password: bcrypt.hashSync('store123', 10),
        employeeId: `EMP-SI-STORE-${i}`,
        role: UserRole.STORE_INCHARGE,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    storeIncharges.push(user);
  }

  // 5. Assign users to projects/sections (not all, for realistic access)
  // Site Incharge 1: Project 1 (all sections), Project 2 (section 1)
  for (const section of allSections.filter(s => s.projectId === projects[0].id)) {
    await prisma.siteInchargeAssignment.upsert({
      where: { userId_sectionId: { userId: siteIncharges[0].id, sectionId: section.id } },
      update: {},
      create: {
        userId: siteIncharges[0].id,
        projectId: projects[0].id,
        sectionId: section.id,
        createdBy: admin.id,
      },
    });
  }
  await prisma.siteInchargeAssignment.upsert({
    where: { userId_sectionId: { userId: siteIncharges[0].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-001')!.id } },
    update: {},
    create: {
      userId: siteIncharges[0].id,
      projectId: projects[1].id,
      sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-001')!.id,
      createdBy: admin.id,
    },
  });
  // Site Incharge 2: Project 2 (all sections)
  for (const section of allSections.filter(s => s.projectId === projects[1].id)) {
    await prisma.siteInchargeAssignment.upsert({
      where: { userId_sectionId: { userId: siteIncharges[1].id, sectionId: section.id } },
      update: {},
      create: {
        userId: siteIncharges[1].id,
        projectId: projects[1].id,
        sectionId: section.id,
        createdBy: admin.id,
      },
    });
  }
  // Site Incharge 3: Project 3 (section 2, 3)
  for (const section of allSections.filter(s => s.projectId === projects[2].id && (s.code === 'SEC-002' || s.code === 'SEC-003'))) {
    await prisma.siteInchargeAssignment.upsert({
      where: { userId_sectionId: { userId: siteIncharges[2].id, sectionId: section.id } },
      update: {},
      create: {
        userId: siteIncharges[2].id,
        projectId: projects[2].id,
        sectionId: section.id,
        createdBy: admin.id,
      },
    });
  }

  // Project Manager 1: Project 1 (section 1), Project 2 (section 2)
  await prisma.projectManagerAssignment.upsert({
    where: { userId_sectionId: { userId: projectManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001')!.id } },
    update: {},
    create: {
      userId: projectManagers[0].id,
      projectId: projects[0].id,
      sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001')!.id,
      createdBy: admin.id,
    },
  });
  await prisma.projectManagerAssignment.upsert({
    where: { userId_sectionId: { userId: projectManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-002')!.id } },
    update: {},
    create: {
      userId: projectManagers[0].id,
      projectId: projects[1].id,
      sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-002')!.id,
      createdBy: admin.id,
    },
  });
  // Project Manager 2: Project 3 (all sections)
  for (const section of allSections.filter(s => s.projectId === projects[2].id)) {
    await prisma.projectManagerAssignment.upsert({
      where: { userId_sectionId: { userId: projectManagers[1].id, sectionId: section.id } },
      update: {},
      create: {
        userId: projectManagers[1].id,
        projectId: projects[2].id,
        sectionId: section.id,
        createdBy: admin.id,
      },
    });
  }

  // Construction Manager 1: Project 1 (section 2)
  await prisma.constructionManagerAssignment.upsert({
    where: { userId_sectionId: { userId: constructionManagers[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-002')!.id } },
    update: {},
    create: {
      userId: constructionManagers[0].id,
      sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-002')!.id,
      createdBy: admin.id,
    },
  });
  // Construction Manager 2: Project 2 (section 3), Project 3 (section 1)
  await prisma.constructionManagerAssignment.upsert({
    where: { userId_sectionId: { userId: constructionManagers[1].id, sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-003')!.id } },
    update: {},
    create: {
      userId: constructionManagers[1].id,
      sectionId: allSections.find(s => s.projectId === projects[1].id && s.code === 'SEC-003')!.id,
      createdBy: admin.id,
    },
  });
  await prisma.constructionManagerAssignment.upsert({
    where: { userId_sectionId: { userId: constructionManagers[1].id, sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-001')!.id } },
    update: {},
    create: {
      userId: constructionManagers[1].id,
      sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-001')!.id,
      createdBy: admin.id,
    },
  });

  // Accountants: assign to various project-section combos
  await prisma.accountantAssignment.upsert({
    where: { userId_projectId_sectionId: { userId: accountants[0].id, projectId: projects[0].id, sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001')!.id } },
    update: {},
    create: {
      userId: accountants[0].id,
      projectId: projects[0].id,
      sectionId: allSections.find(s => s.projectId === projects[0].id && s.code === 'SEC-001')!.id,
      createdBy: admin.id,
    },
  });
  await prisma.accountantAssignment.upsert({
    where: { userId_projectId_sectionId: { userId: accountants[1].id, projectId: projects[2].id, sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-003')!.id } },
    update: {},
    create: {
      userId: accountants[1].id,
      projectId: projects[2].id,
      sectionId: allSections.find(s => s.projectId === projects[2].id && s.code === 'SEC-003')!.id,
      createdBy: admin.id,
    },
  });

  // 6. Create Stores and assign store incharges
  for (const section of allSections) {
    const headStore = await prisma.store.upsert({
      where: { id: `head-${section.id}` },
      update: {},
      create: {
        id: `head-${section.id}`,
        name: `Head Store for ${section.code}`,
        type: StoreType.HEAD_STORE,
        sectionId: section.id,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    await prisma.store.upsert({
      where: { id: `cm-${section.id}` },
      update: {},
      create: {
        id: `cm-${section.id}`,
        name: `CM Store for ${section.code}`,
        type: StoreType.CM_STORE,
        sectionId: section.id,
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    // Assign store incharges in a round-robin way
    const storeIncharge = storeIncharges[(parseInt(section.code.split('-')[1]) + 1) % storeIncharges.length];
    await prisma.storeInchargeAssignment.upsert({
      where: { userId_storeId: { userId: storeIncharge.id, storeId: headStore.id } },
      update: {},
      create: {
        userId: storeIncharge.id,
        storeId: headStore.id,
        createdBy: admin.id,
      },
    });
  }

  // 7. Create Vendors, Materials, Demands for each project
  for (const project of projects) {
    // Vendor
    let vendor = await prisma.vendor.findFirst({ where: { email: `vendor-${project.code}@example.com` } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          name: `Vendor for ${project.name}`,
          contactPerson: `Contact ${project.name}`,
          email: `vendor-${project.code}@example.com`,
          phone: '1234567890',
          address: `Address for ${project.name}`,
          isActive: true,
          isDeleted: false,
          createdBy: admin.id,
        },
      });
    }
    await prisma.vendorAccount.upsert({
      where: { vendorId: vendor.id },
      update: {},
      create: { vendorId: vendor.id },
    });
    // Material
    const material = await prisma.material.upsert({
      where: { name: `Cement for ${project.code}` },
      update: {},
      create: {
        name: `Cement for ${project.code}`,
        unit: 'Bag',
        isActive: true,
        isDeleted: false,
        createdBy: admin.id,
      },
    });
    // Demand (for first section of each project)
    const section = allSections.find(s => s.projectId === project.id && s.code === 'SEC-001');
    if (section) {
      const demand = await prisma.demand.upsert({
        where: { referenceNumber: `DEM-${project.code}` },
        update: {},
        create: {
          referenceNumber: `DEM-${project.code}`,
          materialId: material.id,
          quantity: 100,
          unit: 'Bag',
          sectionId: section.id,
          status: DemandStatus.REQUEST_SENT,
          createdBy: constructionManagers[0].id,
          quantityRemaining: 100,
        },
      });

      // Create Purchase Orders with amounts for each demand
      const po = await prisma.purchaseOrder.create({
        data: {
          referenceNumber: `PO-${project.code}-001`,
          demandId: demand.id,
          projectId: project.id,
          sectionId: section.id,
          materialId: material.id,
          vendorId: vendor.id,
          quantity: 50,
          unitPrice: 150.00,
          totalAmount: 7500.00,
          proofOfBill: 'https://example.com/bill-001.pdf',
          amountAddedBy: siteIncharges[0].id,
          amountAddedAt: new Date(),
          status: 'ORDER_PLACED',
          createdBy: siteIncharges[0].id,
        },
      });

      // Create vendor account transaction for the PO amount
      const vendorAccount = await prisma.vendorAccount.findUnique({
        where: { vendorId: vendor.id },
      });

      if (vendorAccount) {
        await prisma.vendorAccountTransaction.create({
          data: {
            vendorAccountId: vendorAccount.id,
            type: 'CREDIT',
            amount: 7500.00,
            purchaseOrderId: po.id,
            addedBy: siteIncharges[0].id,
            proofOfPayment: 'https://example.com/bill-001.pdf',
            note: `Credit for PO ${po.referenceNumber}`,
          },
        });

        // Update vendor account balance
        await prisma.vendorAccount.update({
          where: { id: vendorAccount.id },
          data: {
            totalCredited: vendorAccount.totalCredited.add(7500.00),
            balance: vendorAccount.balance.add(7500.00),
          },
        });
      }
    }
  }

  console.log('Dummy data seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 