import "dotenv/config";
import prisma from "../utils/prisma";
import { LOT4_USER_SPECS } from "./n55UserSpecs";
import {
  type CredentialRow,
  ensureHeadStoreAssignment,
  findAdminUser,
  generateUniquePassword,
  printCredentialsTable,
  upsertUser,
  writeLotCredentialsDoc,
} from "./n55UserSeedShared";

async function main() {
  if (LOT4_USER_SPECS.length !== 24) {
    throw new Error(`Expected 24 LOT-4 users, got ${LOT4_USER_SPECS.length}`);
  }

  const admin = await findAdminUser();

  console.log("\n=== Seeding N55 LOT-4 users ===\n");

  const credentials: CredentialRow[] = [];

  for (const spec of LOT4_USER_SPECS) {
    const plainPassword = generateUniquePassword();
    const action = await upsertUser(spec, plainPassword, admin.id);
    credentials.push({ ...spec, plainPassword, action });
    console.log(
      `${action === "created" ? "Created" : "Updated"} [${spec.group}] ${spec.email}`
    );
    
    // For Head Store users, ensure they have the project assignment
    await ensureHeadStoreAssignment(spec, admin.id);
  }

  const { docxPath, txtPath } = await writeLotCredentialsDoc("LOT4", credentials);

  printCredentialsTable("LOT4", credentials);
  console.log(
    "\nEach user has a unique password. Re-running this script regenerates LOT-4 passwords."
  );
  console.log(`\nCredentials document: ${docxPath}`);
  console.log(`Credentials backup:   ${txtPath}`);
  console.log(`\nTotal users processed: ${credentials.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
