import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";
import { assignHeadOfficeAccountantsToProject } from "../utils/pettyCashAccess";

const PASSWORD = "Radc@2026";

const EXPENSE_HEADS = [
  "Utility Bills",
  "Lunch",
  "Groceries",
  "Chai & Refreshments",
  "Transport",
  "Stationery",
  "Maintenance",
  "Miscellaneous",
];

type SectionSpec = { name: string; code: string };

type ProjectSpec = {
  name: string;
  code: string;
  sections: SectionSpec[];
};

const PROJECTS: ProjectSpec[] = [
  {
    name: "N-55 LOT-3",
    code: "N55-LOT3",
    sections: [
      { name: "Section-4", code: "SEC-4" },
      { name: "Section-5", code: "SEC-5" },
    ],
  },
  {
    name: "N-55 Lot-4",
    code: "N55-LOT4",
    sections: [
      { name: "Section-1", code: "SEC-1" },
      { name: "Section-2", code: "SEC-2" },
    ],
  },
  {
    name: "Darel",
    code: "DAREL",
    sections: [],
  },
];

const HEAD_OFFICE_ACCOUNTANT = {
  name: "Head Office Accountant",
  email: "HOA@radc.com",
  employeeId: "HOA-001",
};

const PROJECT_ACCOUNTANTS = [
  {
    name: "N-55 LOT-3 Project Accountant",
    email: "PA-N55lot3@radc.com",
    employeeId: "PA-N55LOT3-001",
    projectCode: "N55-LOT3",
  },
  {
    name: "N-55 Lot-4 Project Accountant",
    email: "PA-N55lot4@radc.com",
    employeeId: "PA-N55LOT4-001",
    projectCode: "N55-LOT4",
  },
  {
    name: "Darel Project Accountant",
    email: "PA-Darel@radc.com",
    employeeId: "PA-DAREL-001",
    projectCode: "DAREL",
  },
];

const SECTION_ACCOUNTANTS = [
  {
    name: "Section-4 Accountant",
    email: "SA4-N55lot3-Section4@radc.com",
    employeeId: "SA4-N55LOT3-001",
    projectCode: "N55-LOT3",
    sectionCode: "SEC-4",
  },
  {
    name: "Section-5 Accountant",
    email: "SA5-N55lot3-Section5@radc.com",
    employeeId: "SA5-N55LOT3-001",
    projectCode: "N55-LOT3",
    sectionCode: "SEC-5",
  },
  {
    name: "Section-1 Accountant",
    email: "SA1-N55lot4-section1@radc.com",
    employeeId: "SA1-N55LOT4-001",
    projectCode: "N55-LOT4",
    sectionCode: "SEC-1",
  },
  {
    name: "Section-2 Accountant",
    email: "SA2-N55lot4-Section2@radc.com",
    employeeId: "SA2-N55LOT4-001",
    projectCode: "N55-LOT4",
    sectionCode: "SEC-2",
  },
];

async function upsertProject(spec: ProjectSpec, createdBy: string) {
  const project = await prisma.project.upsert({
    where: { code: spec.code },
    update: {
      name: spec.name,
      isActive: true,
      isDeleted: false,
    },
    create: {
      name: spec.name,
      code: spec.code,
      description: `${spec.name} — client demo project`,
      isActive: true,
      isDeleted: false,
      createdBy,
    },
  });

  const sections: { id: string; name: string; code: string }[] = [];
  for (const sectionSpec of spec.sections) {
    const section = await prisma.section.upsert({
      where: {
        projectId_code: { projectId: project.id, code: sectionSpec.code },
      },
      update: {
        name: sectionSpec.name,
        isActive: true,
        isDeleted: false,
      },
      create: {
        name: sectionSpec.name,
        code: sectionSpec.code,
        projectId: project.id,
        isActive: true,
        isDeleted: false,
        createdBy,
      },
    });
    sections.push({ id: section.id, name: section.name, code: section.code });
  }

  await assignHeadOfficeAccountantsToProject(project.id, createdBy);

  return { id: project.id, name: project.name, code: project.code, sections };
}

async function upsertAccountant(params: {
  name: string;
  email: string;
  employeeId: string;
  isHead: boolean;
  createdBy: string;
}) {
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: params.email } });

  if (existing) {
    return prisma.user.update({
      where: { email: params.email },
      data: {
        name: params.name,
        password: hashedPassword,
        role: "ACCOUNTANT",
        employeeId: params.employeeId,
        isHead: params.isHead,
        isActive: true,
        isDeleted: false,
      },
    });
  }

  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      password: hashedPassword,
      employeeId: params.employeeId,
      role: "ACCOUNTANT",
      isHead: params.isHead,
      isActive: true,
      isDeleted: false,
      createdBy: params.createdBy,
    },
  });
}

async function seedExpenseHeads(createdBy: string) {
  for (const name of EXPENSE_HEADS) {
    const existing = await prisma.pettyCashExpenseHead.findFirst({
      where: { name, isDeleted: false },
    });
    if (!existing) {
      await prisma.pettyCashExpenseHead.create({ data: { name, createdBy } });
      console.log(`  + expense head: ${name}`);
    }
  }
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: {
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      isDeleted: false,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!admin) {
    throw new Error("No admin user found.");
  }

  console.log("\n=== Projects & sections ===");
  const projectsByCode: Record<
    string,
    { id: string; name: string; code: string; sections: { id: string; name: string; code: string }[] }
  > = {};

  for (const spec of PROJECTS) {
    const project = await upsertProject(spec, admin.id);
    projectsByCode[project.code] = project;
    const sectionList =
      project.sections.length > 0
        ? project.sections.map((s) => s.name).join(", ")
        : "(no sections yet)";
    console.log(`✓ ${project.name} (${project.code}) — ${sectionList}`);
  }

  const credentials: Array<{ role: string; email: string; assignment: string }> =
    [];

  console.log("\n=== Head Office Accountant ===");
  const hoa = await upsertAccountant({
    ...HEAD_OFFICE_ACCOUNTANT,
    isHead: true,
    createdBy: admin.id,
  });

  await prisma.accountantAssignment.deleteMany({ where: { userId: hoa.id } });
  const allProjects = await prisma.project.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  for (const project of allProjects) {
    await prisma.accountantAssignment.create({
      data: {
        userId: hoa.id,
        projectId: project.id,
        sectionId: null,
        isActive: true,
        createdBy: admin.id,
      },
    });
  }
  const hoaAssignment = allProjects.map((p) => p.name).join(", ");
  credentials.push({
    role: "Head Office Accountant",
    email: HEAD_OFFICE_ACCOUNTANT.email,
    assignment: hoaAssignment,
  });
  console.log(`✓ ${HEAD_OFFICE_ACCOUNTANT.email} → ${hoaAssignment}`);

  console.log("\n=== Project Accountants ===");
  for (const spec of PROJECT_ACCOUNTANTS) {
    const project = projectsByCode[spec.projectCode];
    if (!project) throw new Error(`Project ${spec.projectCode} not found`);

    const user = await upsertAccountant({
      name: spec.name,
      email: spec.email,
      employeeId: spec.employeeId,
      isHead: true,
      createdBy: admin.id,
    });

    await prisma.accountantAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.accountantAssignment.create({
      data: {
        userId: user.id,
        projectId: project.id,
        sectionId: null,
        isActive: true,
        createdBy: admin.id,
      },
    });

    credentials.push({
      role: "Project Accountant",
      email: spec.email,
      assignment: project.name,
    });
    console.log(`✓ ${spec.email} → ${project.name}`);
  }

  console.log("\n=== Section Accountants ===");
  for (const spec of SECTION_ACCOUNTANTS) {
    const project = projectsByCode[spec.projectCode];
    if (!project) throw new Error(`Project ${spec.projectCode} not found`);
    const section = project.sections.find((s) => s.code === spec.sectionCode);
    if (!section) throw new Error(`Section ${spec.sectionCode} not found`);

    const user = await upsertAccountant({
      name: spec.name,
      email: spec.email,
      employeeId: spec.employeeId,
      isHead: false,
      createdBy: admin.id,
    });

    await prisma.accountantAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.accountantAssignment.create({
      data: {
        userId: user.id,
        projectId: project.id,
        sectionId: section.id,
        isActive: true,
        createdBy: admin.id,
      },
    });

    credentials.push({
      role: "Section Accountant",
      email: spec.email,
      assignment: `${project.name} → ${section.name}`,
    });
    console.log(`✓ ${spec.email} → ${project.name} → ${section.name}`);
  }

  console.log("\n=== Petty cash expense heads ===");
  await seedExpenseHeads(admin.id);

  console.log("\n" + "=".repeat(80));
  console.log("CLIENT DEMO CREDENTIALS (live database)");
  console.log("Password for all accounts below:", PASSWORD);
  console.log("=".repeat(80));
  console.log("Role".padEnd(26) + "Email".padEnd(36) + "Assignment");
  console.log("-".repeat(80));
  for (const row of credentials) {
    console.log(row.role.padEnd(26) + row.email.padEnd(36) + row.assignment);
  }
  console.log("=".repeat(80));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
