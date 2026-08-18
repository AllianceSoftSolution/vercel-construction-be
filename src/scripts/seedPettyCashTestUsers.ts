import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";

const PASSWORD = "PettyCash@2026";

type ProjectSpec = {
  name: string;
  code: string;
  sections: { name: string; code: string }[];
};

const PROJECTS: ProjectSpec[] = [
  {
    name: "Test Project 1",
    code: "TP-001",
    sections: [
      { name: "Section 1", code: "TP1-SEC-1" },
      { name: "Section 2", code: "TP1-SEC-2" },
    ],
  },
  {
    name: "Test Project 2",
    code: "TP-002",
    sections: [{ name: "Section 1", code: "TP2-SEC-1" }],
  },
  {
    name: "Test Project 3",
    code: "TP-003",
    sections: [
      { name: "Section 1", code: "TP3-SEC-1" },
      { name: "Section 2", code: "TP3-SEC-2" },
    ],
  },
];

type PmSpec = {
  name: string;
  email: string;
  employeeId: string;
  projectCode: string;
  sectionCode: string;
};

const PROJECT_MANAGERS: PmSpec[] = [
  {
    name: "TP1 Project Manager 1",
    email: "tp1_pm_1@gmail.com",
    employeeId: "TP1-PM-001",
    projectCode: "TP-001",
    sectionCode: "TP1-SEC-1",
  },
  {
    name: "TP1 Project Manager 2",
    email: "tp1_pm_2@gmail.com",
    employeeId: "TP1-PM-002",
    projectCode: "TP-001",
    sectionCode: "TP1-SEC-2",
  },
  {
    name: "TP2 Project Manager 1",
    email: "tp2_pm_1@gmail.com",
    employeeId: "TP2-PM-001",
    projectCode: "TP-002",
    sectionCode: "TP2-SEC-1",
  },
];

type SaSpec = {
  name: string;
  email: string;
  employeeId: string;
  projectCode: string;
  sectionCode: string;
};

const SECTION_ACCOUNTANTS: SaSpec[] = [
  {
    name: "TP1 Section Accountant 1",
    email: "tp1_sa_1@gmail.com",
    employeeId: "TP1-SA-001",
    projectCode: "TP-001",
    sectionCode: "TP1-SEC-1",
  },
  {
    name: "TP1 Section Accountant 2",
    email: "tp1_sa_2@gmail.com",
    employeeId: "TP1-SA-002",
    projectCode: "TP-001",
    sectionCode: "TP1-SEC-2",
  },
  {
    name: "TP2 Section Accountant 1",
    email: "tp2_sa_1@gmail.com",
    employeeId: "TP2-SA-001",
    projectCode: "TP-002",
    sectionCode: "TP2-SEC-1",
  },
  {
    name: "TP3 Section Accountant 1",
    email: "tp3_sa_1@gmail.com",
    employeeId: "TP3-SA-001",
    projectCode: "TP-003",
    sectionCode: "TP3-SEC-1",
  },
  {
    name: "TP3 Section Accountant 2",
    email: "tp3_sa_2@gmail.com",
    employeeId: "TP3-SA-002",
    projectCode: "TP-003",
    sectionCode: "TP3-SEC-2",
  },
];

const HEAD_OFFICE_ACCOUNTANT = {
  name: "Head Office Accountant",
  email: "tp_hoa_1@gmail.com",
  employeeId: "TP-HOA-001",
};

type PaSpec = {
  name: string;
  email: string;
  employeeId: string;
  projectCodes: string[];
};

const PROJECT_ACCOUNTANTS: PaSpec[] = [
  {
    name: "TP1 Project Accountant",
    email: "tp1_pa_1@gmail.com",
    employeeId: "TP1-PA-001",
    projectCodes: ["TP-001"],
  },
  {
    name: "TP2 Project Accountant",
    email: "tp2_pa_1@gmail.com",
    employeeId: "TP2-PA-001",
    projectCodes: ["TP-002"],
  },
  {
    name: "TP1+TP3 Project Accountant",
    email: "tp13_pa_1@gmail.com",
    employeeId: "TP13-PA-001",
    projectCodes: ["TP-001", "TP-003"],
  },
];

async function removeRadcTestUsers(adminId: string) {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@radc.test" } },
    select: { id: true, email: true, name: true },
  });

  if (testUsers.length === 0) {
    console.log("No @radc.test users found.");
    return;
  }

  const ids = testUsers.map((u) => u.id);
  console.log(`Removing ${testUsers.length} @radc.test user(s)...`);

  await prisma.accountantAssignment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.projectManagerAssignment.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.siteInchargeAssignment.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.constructionManagerAssignment.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.storeInchargeAssignment.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.headStoreInchargeAssignment.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.deviceToken.deleteMany({ where: { userId: { in: ids } } });

  await prisma.pettyCashTransaction.updateMany({
    where: { recipientUserId: { in: ids } },
    data: { recipientUserId: null },
  });
  await prisma.pettyCashTransaction.updateMany({
    where: { createdBy: { in: ids } },
    data: { createdBy: adminId },
  });
  await prisma.user.updateMany({
    where: { createdBy: { in: ids } },
    data: { createdBy: adminId },
  });

  for (const user of testUsers) {
    try {
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`  Deleted ${user.email}`);
    } catch {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: false,
          isDeleted: true,
          email: `removed.${user.id}@deleted.invalid`,
          employeeId: `DEL-${user.id.slice(-8)}`,
        },
      });
      console.log(`  Soft-deleted ${user.email} (FK references remain)`);
    }
  }
}

async function upsertProject(
  spec: ProjectSpec,
  createdBy: string
): Promise<{
  id: string;
  name: string;
  code: string;
  sections: { id: string; name: string; code: string }[];
}> {
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
      description: `${spec.name} — petty cash test project`,
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

  return { id: project.id, name: project.name, code: project.code, sections };
}

async function upsertUser(params: {
  name: string;
  email: string;
  employeeId: string;
  role: "PROJECT_MANAGER" | "ACCOUNTANT";
  isHead: boolean;
  createdBy: string;
}) {
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  const existingByEmail = await prisma.user.findUnique({
    where: { email: params.email },
  });
  const existingByEmployee = await prisma.user.findUnique({
    where: { employeeId: params.employeeId },
  });

  if (existingByEmployee && existingByEmployee.email !== params.email) {
    throw new Error(
      `Employee ID ${params.employeeId} already used by ${existingByEmployee.email}`
    );
  }

  if (existingByEmail) {
    return prisma.user.update({
      where: { email: params.email },
      data: {
        name: params.name,
        password: hashedPassword,
        role: params.role,
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
      role: params.role,
      isHead: params.isHead,
      isActive: true,
      isDeleted: false,
      createdBy: params.createdBy,
    },
  });
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
    throw new Error("No admin user found. Create an admin first.");
  }

  console.log("\n=== 1) Remove @radc.test users ===");
  await removeRadcTestUsers(admin.id);

  console.log("\n=== 2) Create test projects & sections ===");
  const projectsByCode: Record<
    string,
    { id: string; name: string; code: string; sections: { id: string; name: string; code: string }[] }
  > = {};

  for (const spec of PROJECTS) {
    const project = await upsertProject(spec, admin.id);
    projectsByCode[project.code] = project;
    console.log(
      `✓ ${project.name} (${project.code}) — ${project.sections
        .map((s) => s.name)
        .join(", ")}`
    );
  }

  const findSection = (projectCode: string, sectionCode: string) => {
    const project = projectsByCode[projectCode];
    const section = project.sections.find((s) => s.code === sectionCode);
    if (!section) {
      throw new Error(`Section ${sectionCode} not found on ${projectCode}`);
    }
    return { project, section };
  };

  const results: Array<{
    role: string;
    email: string;
    assignment: string;
  }> = [];

  console.log("\n=== 3a) Project Managers ===");
  for (const spec of PROJECT_MANAGERS) {
    const { project, section } = findSection(spec.projectCode, spec.sectionCode);
    const user = await upsertUser({
      name: spec.name,
      email: spec.email,
      employeeId: spec.employeeId,
      role: "PROJECT_MANAGER",
      isHead: false,
      createdBy: admin.id,
    });

    await prisma.projectManagerAssignment.deleteMany({
      where: { userId: user.id },
    });
    await prisma.projectManagerAssignment.create({
      data: {
        userId: user.id,
        projectId: project.id,
        sectionId: section.id,
        isActive: true,
        createdBy: admin.id,
      },
    });

    const assignment = `${project.name} → ${section.name}`;
    results.push({ role: "Project Manager", email: spec.email, assignment });
    console.log(`✓ ${spec.email} → ${assignment}`);
  }

  console.log("\n=== 3b) Section Accountants ===");
  for (const spec of SECTION_ACCOUNTANTS) {
    const { project, section } = findSection(spec.projectCode, spec.sectionCode);
    const user = await upsertUser({
      name: spec.name,
      email: spec.email,
      employeeId: spec.employeeId,
      role: "ACCOUNTANT",
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

    const assignment = `${project.name} → ${section.name}`;
    results.push({
      role: "Section Accountant",
      email: spec.email,
      assignment,
    });
    console.log(`✓ ${spec.email} → ${assignment}`);
  }

  console.log("\n=== 3c) Head Office Accountant (all projects) ===");
  const hoa = await upsertUser({
    name: HEAD_OFFICE_ACCOUNTANT.name,
    email: HEAD_OFFICE_ACCOUNTANT.email,
    employeeId: HEAD_OFFICE_ACCOUNTANT.employeeId,
    role: "ACCOUNTANT",
    isHead: true,
    createdBy: admin.id,
  });

  await prisma.accountantAssignment.deleteMany({ where: { userId: hoa.id } });

  const allProjects = await prisma.project.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, code: true },
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

  results.push({
    role: "Head Office Accountant",
    email: HEAD_OFFICE_ACCOUNTANT.email,
    assignment: `All ${allProjects.length} project(s)`,
  });
  console.log(
    `✓ ${HEAD_OFFICE_ACCOUNTANT.email} → ${allProjects
      .map((p) => p.name)
      .join(", ")}`
  );

  console.log("\n=== 3d) Project Accountants (assigned projects only) ===");
  for (const spec of PROJECT_ACCOUNTANTS) {
    const user = await upsertUser({
      name: spec.name,
      email: spec.email,
      employeeId: spec.employeeId,
      role: "ACCOUNTANT",
      isHead: true,
      createdBy: admin.id,
    });

    await prisma.accountantAssignment.deleteMany({ where: { userId: user.id } });

    const assignedNames: string[] = [];
    for (const code of spec.projectCodes) {
      const project = projectsByCode[code];
      if (!project) throw new Error(`Project ${code} not found`);
      await prisma.accountantAssignment.create({
        data: {
          userId: user.id,
          projectId: project.id,
          sectionId: null,
          isActive: true,
          createdBy: admin.id,
        },
      });
      assignedNames.push(`${project.name} (${project.code})`);
    }

    const assignment = assignedNames.join(", ");
    results.push({
      role: "Project Accountant",
      email: spec.email,
      assignment,
    });
    console.log(`✓ ${spec.email} → ${assignment}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("PETTY CASH TEST CREDENTIALS");
  console.log("Password for all accounts below:", PASSWORD);
  console.log("=".repeat(78));
  console.log(
    "Role".padEnd(26) + "Email".padEnd(28) + "Assignment"
  );
  console.log("-".repeat(78));
  for (const r of results) {
    console.log(r.role.padEnd(26) + r.email.padEnd(28) + r.assignment);
  }
  console.log("=".repeat(78));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
