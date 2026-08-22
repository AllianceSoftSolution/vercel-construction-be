import "dotenv/config";
import prisma from "../utils/prisma";
import {
  computeProjectBalances,
  getHeadOfficeDistributableRemaining,
  getHeadOfficePettyCashProjectId,
} from "../utils/pettyCashAccess";

const DRY_RUN = process.argv.includes("--dry-run");

/** Descriptions created by automated/manual QA today */
const TEST_DESCRIPTION_MARKERS = [
  "pool-flow-test",
  "hoa-pool-test",
  "should-fail",
  "role-access-test",
  "hoa-access-test",
  "missing-proof",
];

async function main() {
  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Cleanup petty cash test transactions\n`);

  const poolProjectId = await getHeadOfficePettyCashProjectId();

  const candidates = await prisma.pettyCashTransaction.findMany({
    where: { isDeleted: false },
    include: {
      project: { select: { code: true, name: true } },
      creator: { select: { email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const toDelete = candidates.filter((tx) => {
    const desc = (tx.description || "").toLowerCase();
    if (TEST_DESCRIPTION_MARKERS.some((m) => desc.includes(m))) return true;
    // All pool deposits on HO-Petty from today's QA (central pool adds)
    if (
      poolProjectId &&
      tx.projectId === poolProjectId &&
      tx.type === "FUNDING"
    ) {
      return true;
    }
    return false;
  });

  if (toDelete.length === 0) {
    console.log("No test transactions found.");
    return;
  }

  console.log(`Found ${toDelete.length} test transaction(s):\n`);
  for (const tx of toDelete) {
    console.log(
      `  - ${tx.project?.code ?? "?"} | ${tx.type} | Rs. ${Number(tx.amount).toLocaleString()} | ${tx.description ?? "(no note)"} | ${tx.creator.email}`
    );
  }

  const n55 = await prisma.project.findFirst({ where: { code: "N55-LOT3" } });
  const beforeN55 = n55
    ? await computeProjectBalances(n55.id)
    : null;
  const beforePool = await getHeadOfficeDistributableRemaining();

  console.log("\nBefore cleanup:");
  if (beforeN55) {
    console.log(
      `  N-55 LOT-3 pool remaining: Rs. ${beforeN55.projectPoolRemaining.toLocaleString()}`
    );
  }
  console.log(`  Head office pool available: Rs. ${beforePool.toLocaleString()}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run without --dry-run to delete.");
    return;
  }

  await prisma.pettyCashTransaction.deleteMany({
    where: { id: { in: toDelete.map((t) => t.id) } },
  });

  const afterN55 = n55 ? await computeProjectBalances(n55.id) : null;
  const afterPool = await getHeadOfficeDistributableRemaining();

  console.log("\nAfter cleanup:");
  if (afterN55) {
    console.log(
      `  N-55 LOT-3 pool remaining: Rs. ${afterN55.projectPoolRemaining.toLocaleString()}`
    );
  }
  console.log(`  Head office pool available: Rs. ${afterPool.toLocaleString()}`);
  console.log(`\nDeleted ${toDelete.length} test transaction(s). Real entries kept.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
