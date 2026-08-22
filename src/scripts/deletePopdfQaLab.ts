import "dotenv/config";
import prisma from "../utils/prisma";

const PROJECT_CODE = "POPDF";
const POPDF_USER_EMAILS = [
  "popdf.cm@radc.test",
  "popdf.pm@radc.test",
  "popdf.si@radc.test",
  "popdf.ac@radc.test",
  "popdf.store@radc.test",
];
const POPDF_VENDOR_EMAIL = "popdf.vendor@radc.test";
const POPDF_MATERIAL_NAME = "PDF Test OPC Cement";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Delete PO PDF QA Lab (${PROJECT_CODE})\n`);

  const project = await prisma.project.findFirst({
    where: { code: PROJECT_CODE },
    include: { sections: { where: { isDeleted: false } } },
  });

  if (!project) {
    console.log("Project not found — nothing to delete.");
    return;
  }

  const sectionIds = project.sections.map((s) => s.id);
  const storeIds = (
    await prisma.store.findMany({
      where: {
        OR: [{ projectId: project.id }, { sectionId: { in: sectionIds } }],
      },
      select: { id: true },
    })
  ).map((s) => s.id);

  const demandIds = (
    await prisma.demand.findMany({
      where: { sectionId: { in: sectionIds } },
      select: { id: true },
    })
  ).map((d) => d.id);

  const poIds = (
    await prisma.purchaseOrder.findMany({
      where: { projectId: project.id },
      select: { id: true },
    })
  ).map((p) => p.id);

  const popdfUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: POPDF_USER_EMAILS } },
        { employeeId: { startsWith: "POPDF-" } },
      ],
      isDeleted: false,
    },
    select: { id: true, email: true, employeeId: true },
  });

  // Safety: only delete users with no assignments outside this project
  const safeUserIds: string[] = [];
  for (const user of popdfUsers) {
    const outside = await Promise.all([
        prisma.siteInchargeAssignment.count({
          where: { userId: user.id, projectId: { not: project.id } },
        }),
        prisma.projectManagerAssignment.count({
          where: { userId: user.id, projectId: { not: project.id } },
        }),
        prisma.constructionManagerAssignment.count({
          where: { userId: user.id, sectionId: { notIn: sectionIds } },
        }),
        prisma.accountantAssignment.count({
          where: { userId: user.id, projectId: { not: project.id } },
        }),
        prisma.headStoreInchargeAssignment.count({
          where: { userId: user.id, projectId: { not: project.id } },
        }),
        prisma.storeInchargeAssignment.count({
          where: { userId: user.id, storeId: { notIn: storeIds } },
        }),
      ]).then((checks) => checks.reduce((sum, n) => sum + n, 0));
    if (outside > 0) {
      console.warn(`  SKIP user ${user.email} — has assignments outside POPDF`);
    } else {
      safeUserIds.push(user.id);
    }
  }

  const vendor = await prisma.vendor.findFirst({
    where: { email: POPDF_VENDOR_EMAIL },
  });
  let deleteVendor = false;
  if (vendor) {
    const otherPos = await prisma.purchaseOrder.count({
      where: { vendorId: vendor.id, projectId: { not: project.id } },
    });
    deleteVendor = otherPos === 0;
  }

  const material = await prisma.material.findFirst({
    where: { name: POPDF_MATERIAL_NAME },
  });
  let deleteMaterial = false;
  if (material) {
    const otherDemands = await prisma.demand.count({
      where: { materialId: material.id, sectionId: { notIn: sectionIds } },
    });
    const otherPos = await prisma.purchaseOrder.count({
      where: { materialId: material.id, projectId: { not: project.id } },
    });
    deleteMaterial = otherDemands === 0 && otherPos === 0;
  }

  console.log("Scope:");
  console.log(`  Project: ${project.name} (${project.id})`);
  console.log(`  Sections: ${sectionIds.length}`);
  console.log(`  Stores: ${storeIds.length}`);
  console.log(`  Demands: ${demandIds.length}`);
  console.log(`  Purchase orders: ${poIds.length}`);
  console.log(`  POPDF-only users to delete: ${safeUserIds.length}`);
  popdfUsers.forEach((u) => console.log(`    - ${u.email}`));
  console.log(`  Delete test vendor: ${deleteVendor}`);
  console.log(`  Delete test material: ${deleteMaterial}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run without --dry-run to delete.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (poIds.length) {
      await tx.vendorAccountTransaction.deleteMany({
        where: { purchaseOrderId: { in: poIds } },
      });
    }
    await tx.vendorAccountTransaction.deleteMany({
      where: { projectId: project.id },
    });
    await tx.vendorPayment.deleteMany({ where: { projectId: project.id } });

    if (poIds.length) {
      await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    }

    if (demandIds.length) {
      await tx.demandApproval.deleteMany({
        where: { demandId: { in: demandIds } },
      });
      await tx.demandFulfillment.deleteMany({
        where: { demandId: { in: demandIds } },
      });
      await tx.demand.deleteMany({ where: { id: { in: demandIds } } });
    }

    if (storeIds.length) {
      await tx.storeTransaction.deleteMany({
        where: {
          OR: [
            { storeId: { in: storeIds } },
            { fromStoreId: { in: storeIds } },
            { toStoreId: { in: storeIds } },
          ],
        },
      });
      await tx.storeInventory.deleteMany({
        where: { storeId: { in: storeIds } },
      });
      await tx.storePermission.deleteMany({
        where: { storeId: { in: storeIds } },
      });
      await tx.storeInchargeAssignment.deleteMany({
        where: { storeId: { in: storeIds } },
      });
      await tx.store.deleteMany({ where: { id: { in: storeIds } } });
    }

    await tx.materialCap.deleteMany({
      where: {
        OR: [{ projectId: project.id }, { sectionId: { in: sectionIds } }],
      },
    });

    await tx.pettyCashTransaction.deleteMany({
      where: {
        OR: [{ projectId: project.id }, { sectionId: { in: sectionIds } }],
      },
    });

    await tx.siteInchargeAssignment.deleteMany({
      where: { projectId: project.id },
    });
    await tx.projectManagerAssignment.deleteMany({
      where: { projectId: project.id },
    });
    await tx.constructionManagerAssignment.deleteMany({
      where: { sectionId: { in: sectionIds } },
    });
    await tx.accountantAssignment.deleteMany({
      where: { projectId: project.id },
    });
    await tx.headStoreInchargeAssignment.deleteMany({
      where: { projectId: project.id },
    });

    await tx.referenceCounter.deleteMany({
      where: { projectCode: PROJECT_CODE },
    });

    if (safeUserIds.length) {
      await tx.deviceToken.deleteMany({ where: { userId: { in: safeUserIds } } });
      await tx.auditLog.deleteMany({ where: { changedBy: { in: safeUserIds } } });
      await tx.user.deleteMany({ where: { id: { in: safeUserIds } } });
    }

    if (deleteVendor && vendor) {
      const vendorAccount = await tx.vendorAccount.findUnique({
        where: { vendorId: vendor.id },
      });
      if (vendorAccount) {
        await tx.vendorAccountTransaction.deleteMany({
          where: { vendorAccountId: vendorAccount.id },
        });
        await tx.vendorAccount.delete({ where: { id: vendorAccount.id } });
      }
      await tx.vendorPayment.deleteMany({ where: { vendorId: vendor.id } });
      await tx.vendor.delete({ where: { id: vendor.id } });
    }

    if (deleteMaterial && material) {
      await tx.material.delete({ where: { id: material.id } });
    }

    if (sectionIds.length) {
      await tx.section.deleteMany({ where: { id: { in: sectionIds } } });
    }

    await tx.project.delete({ where: { id: project.id } });
  });

  console.log("\nDeleted PO PDF QA Lab and scoped data successfully.");

  const stillThere = await prisma.project.findFirst({ where: { code: PROJECT_CODE } });
  console.log(`  Project removed: ${!stillThere}`);
  const hoaAssign = await prisma.accountantAssignment.count({
    where: { project: { code: PROJECT_CODE } },
  });
  console.log(`  Remaining POPDF assignments: ${hoaAssign}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
