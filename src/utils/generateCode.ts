import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const generateProjectCode = async (): Promise<string> => {
  let nextNumber = 1;
  let code: string;
  let exists = true;

  while (exists) {
    code = `PR${nextNumber.toString().padStart(3, '0')}`;
    const project = await prisma.project.findUnique({ where: { code } });
    if (!project) {
      exists = false;
    } else {
      nextNumber++;
    }
  }

  return code!;
};

export const generateSectionCode = async (): Promise<string> => {
  let nextNumber = 1;
  let code: string;
  let exists = true;

  while (exists) {
    code = `SEC-${nextNumber.toString().padStart(3, '0')}`;
    const section = await prisma.section.findFirst({ where: { code } });
    if (!section) {
      exists = false;
    } else {
      nextNumber++;
    }
  }

  return code!;
};

export const generateDemandCode = async (sectionId: string): Promise<string> => {
  let nextNumber = 1;
  let code: string;
  let exists = true;

  while (exists) {
    code = `DEM${sectionId}${nextNumber.toString().padStart(3, '0')}`;
    const demand = await prisma.demand.findUnique({ where: { referenceNumber: code } });
    if (!demand) {
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