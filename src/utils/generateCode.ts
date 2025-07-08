import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const generateProjectCode = async (): Promise<string> => {
  // Get the latest project to determine the next number
  const latestProject = await prisma.project.findFirst({
    where: {
      code: {
        startsWith: 'PR'
      }
    },
    orderBy: {
      code: 'desc'
    }
  });

  let nextNumber = 1;

  if (latestProject && latestProject.code) {
    // Extract the number from the latest code (e.g., "PR001" -> 1)
    const match = latestProject.code.match(/^PR(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  // Format the code as PRXXX (e.g., PR001, PR002, etc.)
  const code = `PR${nextNumber.toString().padStart(3, '0')}`;
  
  return code;
};

export const generateSectionCode = async (projectId: string): Promise<string> => {
  // Get the project to extract its number
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { code: true }
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Extract project number from project code (e.g., "PR001" -> "001")
  const projectMatch = project.code.match(/^PR(\d+)$/);
  if (!projectMatch) {
    throw new Error("Invalid project code format");
  }

  const projectNumber = projectMatch[1]; // e.g., "001"

  // Get the latest section for this project to determine the next number
  const latestSection = await prisma.section.findFirst({
    where: {
      projectId,
      code: {
        startsWith: `SEC${projectNumber}`
      },
      isDeleted: false
    },
    orderBy: {
      code: 'desc'
    }
  });

  let nextNumber = 1;

  if (latestSection && latestSection.code) {
    // Extract the section number from the latest code (e.g., "SEC001001" -> 1)
    const sectionMatch = latestSection.code.match(new RegExp(`^SEC${projectNumber}(\\d+)$`));
    if (sectionMatch) {
      nextNumber = parseInt(sectionMatch[1]) + 1;
    }
  }

  // Format the code as SEC<Project Number>XXX (e.g., SEC001001, SEC001002, etc.)
  const code = `SEC${projectNumber}${nextNumber.toString().padStart(3, '0')}`;
  
  return code;
};

export const generateDemandCode = async (sectionId: string): Promise<string> => {
  // Get the section to extract project and section numbers
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: {
      project: {
        select: { code: true }
      }
    }
  });

  if (!section) {
    throw new Error("Section not found");
  }

  // Extract project number from project code (e.g., "PR001" -> "001")
  const projectMatch = section.project.code.match(/^PR(\d+)$/);
  if (!projectMatch) {
    throw new Error("Invalid project code format");
  }

  const projectNumber = projectMatch[1]; // e.g., "001"

  // Extract section number from section code (e.g., "SEC001001" -> "001")
  const sectionMatch = section.code.match(new RegExp(`^SEC${projectNumber}(\\d+)$`));
  if (!sectionMatch) {
    throw new Error("Invalid section code format");
  }

  const sectionNumber = sectionMatch[1]; // e.g., "001"

  // Get the latest demand for this section to determine the next number
  const latestDemand = await prisma.demand.findFirst({
    where: {
      sectionId,
      referenceNumber: {
        startsWith: `DEM${projectNumber}${sectionNumber}`
      },
      isDeleted: false
    },
    orderBy: {
      referenceNumber: 'desc'
    }
  });

  let nextNumber = 1;

  if (latestDemand && latestDemand.referenceNumber) {
    // Extract the demand number from the latest code (e.g., "DEM001001001" -> 1)
    const demandMatch = latestDemand.referenceNumber.match(new RegExp(`^DEM${projectNumber}${sectionNumber}(\\d+)$`));
    if (demandMatch) {
      nextNumber = parseInt(demandMatch[1]) + 1;
    }
  }

  // Format the code as DEM<Project Number><Section Number>XXX (e.g., DEM001001001, DEM001001002, etc.)
  const code = `DEM${projectNumber}${sectionNumber}${nextNumber.toString().padStart(3, '0')}`;
  
  return code;
};

export const generateEmployeeId = async (role: string): Promise<string> => {
  // Get the latest user with the same role to determine the next number
  const latestUser = await prisma.user.findFirst({
    where: {
      role: role as any,
      employeeId: {
        startsWith: `EMP-${role.substring(0, 2).toUpperCase()}`
      }
    },
    orderBy: {
      employeeId: 'desc'
    }
  });

  let nextNumber = 1;

  if (latestUser && latestUser.employeeId) {
    // Extract the number from the latest employee ID (e.g., "EMP-AD-1" -> 1)
    const match = latestUser.employeeId.match(new RegExp(`^EMP-${role.substring(0, 2).toUpperCase()}-(\\d+)$`));
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  // Format the employee ID as EMP-XX-N (e.g., EMP-AD-1, EMP-SI-1, etc.)
  const employeeId = `EMP-${role.substring(0, 2).toUpperCase()}-${nextNumber}`;
  
  return employeeId;
}; 