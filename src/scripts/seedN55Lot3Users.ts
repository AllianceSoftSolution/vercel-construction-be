import "dotenv/config";
import prisma from "../utils/prisma";
import { LOT3_USER_SPECS } from "./n55UserSpecs";
import {
  type CredentialRow,
  findAdminUser,
  generateUniquePassword,
  printCredentialsTable,
  upsertUser,
  writeLotCredentialsDoc,
} from "./n55UserSeedShared";

async function main() {
  if (LOT3_USER_SPECS.length !== 30) {
    throw new Error(`Expected 30 users, got ${LOT3_USER_SPECS.length}`);
  }

  const admin = await findAdminUser();

  console.log("\n=== Seeding N55 LOT-3 users (emails only, no assignments) ===\n");

  const credentials: CredentialRow[] = [];

  for (const spec of LOT3_USER_SPECS) {
    const plainPassword = generateUniquePassword();
    const action = await upsertUser(spec, plainPassword, admin.id);
    credentials.push({ ...spec, plainPassword, action });
    console.log(
      `${action === "created" ? "Created" : "Updated"} [${spec.group}] ${spec.email}`
    );
  }

  const { docxPath, txtPath } = await writeLotCredentialsDoc("LOT3", credentials);

  printCredentialsTable("LOT3", credentials);
  console.log(
    "\nEach user has a unique password. Re-running this script regenerates LOT-3 passwords."
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
