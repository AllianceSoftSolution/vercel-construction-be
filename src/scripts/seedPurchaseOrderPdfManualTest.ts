import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";

const PASSWORD = "PdfTest@2026";
const PROJECT_CODE = "POPDF";
const SECTION_CODE = "001";

const USERS = {
  cm: {
    email: "popdf.cm@radc.test",
    name: "PDF Test CM",
    employeeId: "POPDF-CM",
    role: "CONSTRUCTION_MANAGER" as const,
  },
  pm: {
    email: "popdf.pm@radc.test",
    name: "PDF Test PM",
    employeeId: "POPDF-PM",
    role: "PROJECT_MANAGER" as const,
  },
  si: {
    email: "popdf.si@radc.test",
    name: "PDF Test SI",
    employeeId: "POPDF-SI",
    role: "SITE_INCHARGE" as const,
  },
  ac: {
    email: "popdf.ac@radc.test",
    name: "PDF Test Accountant",
    employeeId: "POPDF-AC",
    role: "ACCOUNTANT" as const,
    isHead: true,
  },
  store: {
    email: "popdf.store@radc.test",
    name: "PDF Test Store",
    employeeId: "POPDF-STORE",
    role: "STORE_INCHARGE" as const,
    isHead: true,
  },
};

const upsertUser = async (
  adminId: string,
  spec: {
    email: string;
    name: string;
    employeeId: string;
    role:
      | "CONSTRUCTION_MANAGER"
      | "PROJECT_MANAGER"
      | "SITE_INCHARGE"
      | "ACCOUNTANT"
      | "STORE_INCHARGE";
    isHead?: boolean;
  }
) => {
  const password = await bcrypt.hash(PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: spec.email } });
  if (existing) {
    return prisma.user.update({
      where: { email: spec.email },
      data: {
        name: spec.name,
        password,
        role: spec.role,
        employeeId: spec.employeeId,
        isHead: spec.isHead ?? false,
        isActive: true,
        isDeleted: false,
      },
    });
  }

  const employeeTaken = await prisma.user.findUnique({
    where: { employeeId: spec.employeeId },
  });
  if (employeeTaken) {
    throw new Error(
      `Employee ID ${spec.employeeId} is already used by ${employeeTaken.email}`
    );
  }

  return prisma.user.create({
    data: {
      name: spec.name,
      email: spec.email,
      password,
      employeeId: spec.employeeId,
      role: spec.role,
      isHead: spec.isHead ?? false,
      isActive: true,
      isDeleted: false,
      createdBy: adminId,
    },
  });
};

const printGuide = (info: {
  projectName: string;
  sectionName: string;
  materialName: string;
  vendorName: string;
  flowDemand: string;
  readyDemand: string;
  unpricedPo: string;
  pricedPo: string;
}) => {
  console.log(`
============================================================
PO PDF MANUAL TEST LAB IS READY
============================================================

App:        http://localhost:5173/login
API:        http://localhost:3000/api
Project:    ${info.projectName}  (${PROJECT_CODE})
Section:    ${info.sectionName}  (${SECTION_CODE})
Material:   ${info.materialName}
Vendor:     ${info.vendorName}

All test-role passwords:  ${PASSWORD}

Admin already in the system:
  radcrustamadc@gmail.com     Admin@2026

------------------------------------------------------------
ACCOUNTS
------------------------------------------------------------
  CM       ${USERS.cm.email}
  PM       ${USERS.pm.email}
  SI       ${USERS.si.email}
  Accountant  ${USERS.ac.email}
  Store    ${USERS.store.email}

PRELOADED RECORDS
  Full-path demand (not approved yet):  ${info.flowDemand}
  Ready demand (already APPROVED):      ${info.readyDemand}
  Unpriced PO (PDF available now):      ${info.unpricedPo}
  Priced PO (rate already filled):      ${info.pricedPo}

============================================================
PATH 1 — Instant PDF check (2 minutes)
============================================================
1. Login as Admin: radcrustamadc@gmail.com / Admin@2026
2. Open Purchase Orders (pOS).
3. Find ${info.unpricedPo}.
4. Action menu → View PDF.
   Expect: logo, project, vendor, section, item, qty, PO number.
           Per Unit Rate is BLANK.
           Created By = PDF Test CM.
           Approved By PM = PDF Test PM.
           Approved By SI = PDF Test SI.
           Approved By Admin is blank.
           Received By is blank.
5. Action menu → Download PDF. File should save as the PO number.
6. Open the same PO detail page and use View / Download there too.
7. Find ${info.pricedPo} and View PDF.
   Expect: Per Unit Rate = 1,250.50
   Expect: Approved By (Admin) shows the admin name (PM + Admin approvals)

Repeat View/Download as:
  SI     → /siteincharge-dashboard/pOS
  PM     → /project-manager-dashboard/pOS
  CM     → /construction-manager-dashboard/pOS
  Store  → /store-incharge-dashboard/pOS
  Accountant → /accountant-dashboard/payables  (unpriced sits in "new POs")

============================================================
PATH 2 — Create PO, then PDF is available immediately
============================================================
1. Login as SI: ${USERS.si.email} / ${PASSWORD}
2. Open Demands → open ${info.readyDemand} (status APPROVED).
3. Create Purchase Order:
     Vendor   = ${info.vendorName}
     Quantity = 40
4. After create, stay on the demand (or go to pOS).
5. View PDF and Download PDF on that new PO.
   Expect: PDF works immediately. Rate is still blank.

============================================================
PATH 3 — Add price, then PDF picks up the new rate
============================================================
1. Login as Accountant: ${USERS.ac.email} / ${PASSWORD}
2. Open Payables.
3. Use either ${info.unpricedPo} or the PO you created in Path 2.
4. Add Price:
     Unit price = 875.25
     Notes      = PDF rate check
     Upload any small PDF or image as the bill.
5. Download the same PO again.
   Expect: Per Unit Rate is now 875.25 (or 1,250.50 if you used the priced fixture).
6. Confirm Excel export and the Proof of Bill link still work.

============================================================
PATH 4 — Full approval story (optional, longest)
============================================================
A. Login as CM: ${USERS.cm.email} / ${PASSWORD}
   Demands → Add Demand
     Section  = ${info.sectionName}
     Material = ${info.materialName}
     Qty      = 80
     Unit     = Bag
     Notes    = Manual PDF flow demand
   Or open the preloaded ${info.flowDemand}.

B. Logout. Login as PM: ${USERS.pm.email} / ${PASSWORD}
   Demands → open that demand → Approve.

C. Logout. Login as SI: ${USERS.si.email} / ${PASSWORD}
   Demands → open that demand → Approve.
   Status should become APPROVED.
   Create Purchase Order (vendor + qty).
   View PDF immediately.

D. Login as Accountant and add a unit price (Path 3).
   Re-download. Rate should now appear.

============================================================
WHAT TO TICK OFF
============================================================
[ ] PDF layout matches the template (wavy black+orange header, crisp dual logo,
    unboxed labels, bordered 4-row table, stacked signatures, orange footer line)
[ ] PDF is exactly ONE page (View and Download)
[ ] A loader/toast shows while the PDF is being generated
[ ] Unpriced PO PDF opens and downloads
[ ] Priced PO PDF shows the unit rate
[ ] New PO (just created) has View/Download immediately
[ ] After Add Price, a fresh download shows the new rate
[ ] Created By is the CM (demand creator), not the SI who made the PO
[ ] PM and SI names appear on Approved By lines (unpriced PO)
[ ] Admin name appears on Approved By (Admin) when an admin approved (priced PO)
[ ] Logo + footer render; extra item rows stay empty
[ ] Proof of Bill / Excel export still work
[ ] Same PDF actions work for Admin, SI, PM, CM, Store, Accountant

Re-run this seed anytime:
  npx ts-node src/scripts/seedPurchaseOrderPdfManualTest.ts
============================================================
`);
};

async function main() {
  const admin =
    (await prisma.user.findUnique({
      where: { email: "radcrustamadc@gmail.com" },
    })) ||
    (await prisma.user.findFirst({
      where: { role: "ADMIN", isDeleted: false, isActive: true },
    }));

  if (!admin) {
    throw new Error(
      "No admin user found. Run seedCoreAdminUsers.ts first, then re-run this script."
    );
  }

  const cm = await upsertUser(admin.id, USERS.cm);
  const pm = await upsertUser(admin.id, USERS.pm);
  const si = await upsertUser(admin.id, USERS.si);
  const ac = await upsertUser(admin.id, USERS.ac);
  const storeUser = await upsertUser(admin.id, USERS.store);

  const project = await prisma.project.upsert({
    where: { code: PROJECT_CODE },
    update: { name: "PO PDF QA Lab", isActive: true, isDeleted: false },
    create: {
      name: "PO PDF QA Lab",
      code: PROJECT_CODE,
      description: "Isolated project for Purchase Order PDF manual testing",
      isActive: true,
      isDeleted: false,
      createdBy: admin.id,
    },
  });

  const section = await prisma.section.upsert({
    where: { projectId_code: { projectId: project.id, code: SECTION_CODE } },
    update: { name: "Main Site", isActive: true, isDeleted: false },
    create: {
      name: "Main Site",
      code: SECTION_CODE,
      projectId: project.id,
      description: "Section used for PO PDF manual testing",
      isActive: true,
      isDeleted: false,
      createdBy: admin.id,
    },
  });

  await prisma.constructionManagerAssignment.upsert({
    where: { userId_sectionId: { userId: cm.id, sectionId: section.id } },
    update: { isActive: true },
    create: { userId: cm.id, sectionId: section.id, createdBy: admin.id },
  });
  await prisma.projectManagerAssignment.upsert({
    where: { userId_sectionId: { userId: pm.id, sectionId: section.id } },
    update: { isActive: true, projectId: project.id },
    create: {
      userId: pm.id,
      projectId: project.id,
      sectionId: section.id,
      createdBy: admin.id,
    },
  });
  await prisma.siteInchargeAssignment.upsert({
    where: { userId_sectionId: { userId: si.id, sectionId: section.id } },
    update: { isActive: true, projectId: project.id },
    create: {
      userId: si.id,
      projectId: project.id,
      sectionId: section.id,
      createdBy: admin.id,
    },
  });
  await prisma.accountantAssignment.upsert({
    where: {
      userId_projectId_sectionId: {
        userId: ac.id,
        projectId: project.id,
        sectionId: section.id,
      },
    },
    update: { isActive: true },
    create: {
      userId: ac.id,
      projectId: project.id,
      sectionId: section.id,
      createdBy: admin.id,
    },
  });

  const headAssignment = await prisma.accountantAssignment.findFirst({
    where: { userId: ac.id, projectId: project.id, sectionId: null },
  });
  if (headAssignment) {
    await prisma.accountantAssignment.update({
      where: { id: headAssignment.id },
      data: { isActive: true },
    });
  } else {
    await prisma.accountantAssignment.create({
      data: {
        userId: ac.id,
        projectId: project.id,
        sectionId: null,
        createdBy: admin.id,
      },
    });
  }

  const material = await prisma.material.upsert({
    where: { name: "PDF Test OPC Cement" },
    update: { unit: "Bag", isActive: true, isDeleted: false },
    create: {
      name: "PDF Test OPC Cement",
      unit: "Bag",
      category: "QA",
      description: "Material used only for PO PDF manual testing",
      isActive: true,
      isDeleted: false,
      createdBy: admin.id,
    },
  });

  await prisma.materialCap.upsert({
    where: { materialId_sectionId: { materialId: material.id, sectionId: section.id } },
    update: { quantity: 10000, unit: "Bag", isActive: true, isDeleted: false },
    create: {
      materialId: material.id,
      sectionId: section.id,
      projectId: project.id,
      quantity: 10000,
      unit: "Bag",
      createdBy: admin.id,
    },
  });

  let vendor = await prisma.vendor.findFirst({
    where: { email: "popdf.vendor@radc.test" },
  });
  if (vendor) {
    vendor = await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        name: "PDF Test Dynamic Supplies",
        isActive: true,
        isDeleted: false,
      },
    });
  } else {
    vendor = await prisma.vendor.create({
      data: {
        name: "PDF Test Dynamic Supplies",
        contactPerson: "Vendor Desk",
        email: "popdf.vendor@radc.test",
        phone: "03001234567",
        address: "QA Warehouse",
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

  const headStore = await prisma.store.upsert({
    where: { id: `popdf-head-${project.id}` },
    update: {
      name: "PO PDF Head Store",
      type: "HEAD_STORE",
      projectId: project.id,
      isActive: true,
      isDeleted: false,
    },
    create: {
      id: `popdf-head-${project.id}`,
      name: "PO PDF Head Store",
      type: "HEAD_STORE",
      projectId: project.id,
      isActive: true,
      isDeleted: false,
      createdBy: admin.id,
    },
  });
  await prisma.headStoreInchargeAssignment.upsert({
    where: { userId_projectId: { userId: storeUser.id, projectId: project.id } },
    update: { isActive: true },
    create: {
      userId: storeUser.id,
      projectId: project.id,
      createdBy: admin.id,
    },
  });
  await prisma.storeInchargeAssignment.upsert({
    where: { userId_storeId: { userId: storeUser.id, storeId: headStore.id } },
    update: { isActive: true },
    create: {
      userId: storeUser.id,
      storeId: headStore.id,
      createdBy: admin.id,
    },
  });

  const upsertDemand = async (
    referenceNumber: string,
    status: "REQUEST_SENT" | "APPROVED" | "PO_CREATED",
    quantity: number,
    secondApprover: "si" | "admin" = "si"
  ) => {
    const demand = await prisma.demand.upsert({
      where: { referenceNumber },
      update: {
        materialId: material.id,
        sectionId: section.id,
        quantity,
        unit: "Bag",
        status,
        quantityRemaining: quantity,
        isDeleted: false,
        createdBy: cm.id,
      },
      create: {
        referenceNumber,
        materialId: material.id,
        sectionId: section.id,
        quantity,
        unit: "Bag",
        status,
        quantityRemaining: quantity,
        notes: "Seeded for PO PDF manual testing",
        createdBy: cm.id,
      },
    });

    if (status !== "REQUEST_SENT") {
      await prisma.demandApproval.upsert({
        where: { demandId_userId: { demandId: demand.id, userId: pm.id } },
        update: { status: "APPROVED", remarks: "PM approval for PDF QA" },
        create: {
          demandId: demand.id,
          userId: pm.id,
          status: "APPROVED",
          remarks: "PM approval for PDF QA",
        },
      });
      const secondUser = secondApprover === "admin" ? admin : si;
      const secondRemark =
        secondApprover === "admin"
          ? "Admin approval for PDF QA"
          : "SI approval for PDF QA";
      await prisma.demandApproval.upsert({
        where: { demandId_userId: { demandId: demand.id, userId: secondUser.id } },
        update: { status: "APPROVED", remarks: secondRemark },
        create: {
          demandId: demand.id,
          userId: secondUser.id,
          status: "APPROVED",
          remarks: secondRemark,
        },
      });
      if (secondApprover === "admin") {
        await prisma.demandApproval.deleteMany({
          where: { demandId: demand.id, userId: si.id },
        });
      }
    }

    return demand;
  };

  const flowDemand = await upsertDemand("DEM-POPDF-FLOW", "REQUEST_SENT", 80);
  const readyDemand = await upsertDemand("DEM-POPDF-READY", "APPROVED", 100);
  const unpricedDemand = await upsertDemand("DEM-POPDF-UNPRICED", "PO_CREATED", 60);
  const pricedDemand = await upsertDemand("DEM-POPDF-PRICED", "PO_CREATED", 25, "admin");

  const unpricedPo = await prisma.purchaseOrder.upsert({
    where: { referenceNumber: "PO-POPDF-UNPRICED" },
    update: {
      demandId: unpricedDemand.id,
      projectId: project.id,
      sectionId: section.id,
      materialId: material.id,
      vendorId: vendor.id,
      quantity: 60,
      unitPrice: null,
      totalAmount: null,
      status: "CREATED",
      isDeleted: false,
      createdBy: si.id,
    },
    create: {
      referenceNumber: "PO-POPDF-UNPRICED",
      demandId: unpricedDemand.id,
      projectId: project.id,
      sectionId: section.id,
      materialId: material.id,
      vendorId: vendor.id,
      quantity: 60,
      status: "CREATED",
      createdBy: si.id,
    },
  });

  const pricedPo = await prisma.purchaseOrder.upsert({
    where: { referenceNumber: "PO-POPDF-PRICED" },
    update: {
      demandId: pricedDemand.id,
      projectId: project.id,
      sectionId: section.id,
      materialId: material.id,
      vendorId: vendor.id,
      quantity: 25,
      unitPrice: 1250.5,
      totalAmount: 31262.5,
      status: "CONFIRMED",
      amountAddedBy: ac.id,
      amountAddedAt: new Date(),
      isDeleted: false,
      createdBy: si.id,
    },
    create: {
      referenceNumber: "PO-POPDF-PRICED",
      demandId: pricedDemand.id,
      projectId: project.id,
      sectionId: section.id,
      materialId: material.id,
      vendorId: vendor.id,
      quantity: 25,
      unitPrice: 1250.5,
      totalAmount: 31262.5,
      status: "CONFIRMED",
      amountAddedBy: ac.id,
      amountAddedAt: new Date(),
      createdBy: si.id,
    },
  });

  printGuide({
    projectName: project.name,
    sectionName: section.name,
    materialName: material.name,
    vendorName: vendor.name,
    flowDemand: flowDemand.referenceNumber,
    readyDemand: readyDemand.referenceNumber,
    unpricedPo: unpricedPo.referenceNumber,
    pricedPo: pricedPo.referenceNumber,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
