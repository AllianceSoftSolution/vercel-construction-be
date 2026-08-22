import "dotenv/config";
import prisma from "../utils/prisma";
import {
  canAddPettyCashFunding,
  getHeadOfficeDistributableRemaining,
  getPettyCashRoleScope,
  getProjectAccountantProjectIds,
  getHeadOfficeProjectIds,
  isHeadOfficeAccountant,
  syncHeadOfficeAccountantProjectAssignments,
} from "../utils/pettyCashAccess";

const EMAIL = "HOA@radc.com";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" }, isDeleted: false },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isHead: true,
      isActive: true,
      accountantAssignments: {
        where: { isActive: true },
        select: {
          projectId: true,
          sectionId: true,
          project: { select: { name: true, code: true, isActive: true, isDeleted: true } },
        },
      },
    },
  });

  if (!user) {
    console.log(`User not found: ${EMAIL}`);
    return;
  }

  console.log("\n=== User ===");
  console.log(JSON.stringify(user, null, 2));

  const allProjectIds = await getHeadOfficeProjectIds();
  const allProjects = await prisma.project.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const assignedIds = await getProjectAccountantProjectIds(user.id);
  const missing = allProjectIds.filter((id) => !assignedIds.includes(id));

  console.log("\n=== Active projects ===");
  allProjects.forEach((p) => console.log(`  ${p.code} ${p.name} (${p.id})`));

  console.log("\n=== Project-level assignments ===");
  user.accountantAssignments
    .filter((a) => a.sectionId === null)
    .forEach((a) =>
      console.log(`  ${a.project?.code} ${a.project?.name} (${a.projectId})`)
    );

  console.log("\n=== Section-level assignments ===");
  const sectionAssignments = user.accountantAssignments.filter((a) => a.sectionId);
  console.log(`  count: ${sectionAssignments.length}`);

  console.log("\n=== Coverage ===");
  console.log(`  assigned project-level: ${assignedIds.length}`);
  console.log(`  active projects total: ${allProjectIds.length}`);
  console.log(`  missing project ids: ${missing.join(", ") || "(none)"}`);

  console.log("\n=== Before sync ===");
  console.log(`  isHeadOfficeAccountant: ${await isHeadOfficeAccountant(user)}`);

  await syncHeadOfficeAccountantProjectAssignments(user.id);
  console.log("\n=== After sync ===");
  console.log(`  isHeadOfficeAccountant: ${await isHeadOfficeAccountant(user)}`);
  console.log(`  roleScope: ${await getPettyCashRoleScope(user)}`);
  console.log(`  canAddFunding: ${await canAddPettyCashFunding(user)}`);
  console.log(
    `  headOfficeDistributableRemaining: ${await getHeadOfficeDistributableRemaining()}`
  );

  if (missing.length > 0) {
    console.log("\n=== Missing projects (by name) ===");
    for (const id of missing) {
      const p = allProjects.find((x) => x.id === id);
      console.log(`  ${p?.code ?? "?"} ${p?.name ?? id}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
