import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const generateProjectCode = async (): Promise<string> => {
  let nextNumber = 1;
  let code: string;
  let exists = true;

  while (exists) {
    code = `PR${nextNumber.toString().padStart(3, "0")}`;
    const project = await prisma.project.findUnique({ where: { code } });
    if (!project) {
      exists = false;
    } else {
      nextNumber++;
    }
  }

  return code!;
};

export const generateSectionCode = async (
  projectId: string
): Promise<string> => {
  // Get project code
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  let nextNumber = 1;
  let code: string;
  let exists = true;
  while (exists) {
    const sectionCode = nextNumber.toString().padStart(3, "0");
    code = `SEC-${project.code}-${sectionCode}`;
    const section = await prisma.section.findFirst({ where: { code } });
    if (!section) {
      exists = false;
    } else {
      nextNumber++;
    }
  }
  return code!;
};

export const generateDemandCode = async (
  projectId: string
): Promise<string> => {
  // Get project code
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  let nextNumber = 1;
  let code: string;
  let exists = true;
  while (exists) {
    const num = nextNumber.toString().padStart(3, "0");
    code = `DEM-${project.code}-${num}`;
    const demand = await prisma.demand.findUnique({
      where: { referenceNumber: code },
    });
    if (!demand) {
      exists = false;
    } else {
      nextNumber++;
    }
  }
  return code!;
};

export const generatePOReferenceNumber = async (
  demandId: string
): Promise<string> => {
  // Get demand, section, project, and demand code
  const demand = await prisma.demand.findUnique({
    where: { id: demandId },
    include: { section: { include: { project: true } } },
  });
  if (!demand || !demand.section || !demand.section.project)
    throw new Error("Demand, section, or project not found");
  const projectCode = demand.section.project.code;
  const sectionCode = demand.section.code.split("-").pop();
  // Get demand code (now DEM-<ProjectCode>-XXX)
  const demandCode = demand.referenceNumber;
  // Find next PO number for this demand
  let nextNumber = 1;
  let code: string;
  let exists = true;
  while (exists) {
    const num = nextNumber.toString().padStart(3, "0");
    code = `PO-${projectCode}-${sectionCode}-${demandCode}/${num}`;
    const po = await prisma.purchaseOrder.findUnique({
      where: { referenceNumber: code },
    });
    if (!po) {
      exists = false;
    } else {
      nextNumber++;
    }
  }
  return code!;
};

export const generateEmployeeId = async (role: string): Promise<string> => {
  const prefix = `EMP-${role.substring(0, 2).toUpperCase()}`;
  let nextNumber = 1;
  let id: string;
  let exists = true;

  while (exists) {
    id = `${prefix}-${nextNumber}`;
    const user = await prisma.user.findUnique({ where: { employeeId: id } });
    if (!user) {
      exists = false;
    } else {
      nextNumber++;
    }
  }

  return id!;
};

// Script to generate 5 codes for each function
if (require.main === module) {
  (async () => {
    // Create a dummy user for createdBy
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "test@example.com",
          password: "test", // In real app, hash this
          name: "Test User",
          employeeId: "EMP-AD-1",
          role: "ADMIN",
        },
      });
    }
    // Create a dummy material for demands/POs
    let material = await prisma.material.findFirst();
    if (!material) {
      material = await prisma.material.create({
        data: {
          name: "Test Material",
          unit: "unit",
          createdBy: user.id,
        },
      });
    }
    // Create a dummy vendor for POs
    let vendor = await prisma.vendor.findFirst();
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          name: "Test Vendor",
          createdBy: user.id,
        },
      });
    }
    console.log("\n--- Project Codes ---");
    for (let i = 0; i < 5; i++) {
      const code = await generateProjectCode();
      console.log(code);
      await prisma.project.create({
        data: { code, name: `Project ${code}`, createdBy: user.id },
      });
    }
    const project = await prisma.project.findFirst();
    if (project) {
      console.log("\n--- Section Codes ---");
      for (let i = 0; i < 5; i++) {
        const code = await generateSectionCode(project.id);
        console.log(code);
        await prisma.section.create({
          data: {
            code,
            name: `Section ${code}`,
            projectId: project.id,
            createdBy: user.id,
          },
        });
      }
      const section = await prisma.section.findFirst({
        where: { projectId: project.id },
      });
      if (section) {
        console.log("\n--- Demand Codes ---");
        for (let i = 0; i < 5; i++) {
          const code = await generateDemandCode(project.id);
          console.log(code);
          await prisma.demand.create({
            data: {
              referenceNumber: code,
              sectionId: section.id,
              materialId: material.id,
              quantity: 1,
              unit: "unit",
              createdBy: user.id,
            },
          });
        }
        const demand = await prisma.demand.findFirst({
          where: { sectionId: section.id },
        });
        if (demand) {
          console.log("\n--- PO Codes ---");
          for (let i = 0; i < 5; i++) {
            const code = await generatePOReferenceNumber(demand.id);
            console.log(code);
            await prisma.purchaseOrder.create({
              data: {
                referenceNumber: code,
                demandId: demand.id,
                projectId: project.id,
                sectionId: section.id,
                materialId: material.id,
                vendorId: vendor.id,
                quantity: 1,
                createdBy: user.id,
              },
            });
          }
        }
      }
    }
    process.exit(0);
  })();
}
