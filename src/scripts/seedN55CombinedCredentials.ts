import "dotenv/config";
import path from "path";
import prisma from "../utils/prisma";
import { LOT3_USER_SPECS, LOT4_USER_SPECS } from "./n55UserSpecs";
import {
  type CredentialRow,
  findAdminUser,
  generateUniquePassword,
  getCredentialsPaths,
  parseExistingCredentialsTxt,
  printCredentialsTable,
  upsertUser,
  writeLotCredentialsDoc,
} from "./n55UserSeedShared";

async function main() {
  const admin = await findAdminUser();
  const lot4TxtPath = getCredentialsPaths("LOT4").txtPath;

  const preservedLot4 = parseExistingCredentialsTxt(
    lot4TxtPath,
    (email) => /N55lot4/i.test(email)
  );

  console.log("\n=== Refreshing LOT-3 passwords and writing separate credential files ===\n");

  const lot3Credentials: CredentialRow[] = [];
  for (const spec of LOT3_USER_SPECS) {
    const plainPassword = generateUniquePassword();
    const action = await upsertUser(spec, plainPassword, admin.id);
    lot3Credentials.push({ ...spec, plainPassword, action });
    console.log(
      `${action === "created" ? "Created" : "Updated"} [LOT3 ${spec.group}] ${spec.email}`
    );
  }

  let lot4Rows = preservedLot4;

  if (lot4Rows.length === LOT4_USER_SPECS.length) {
    console.log(`\nPreserved ${lot4Rows.length} LOT-4 credential rows from existing file.`);
  } else {
    console.log("\nLOT-4 credentials missing or incomplete — seeding LOT-4 users again.\n");
    lot4Rows = [];
    for (const spec of LOT4_USER_SPECS) {
      const plainPassword = generateUniquePassword();
      const action = await upsertUser(spec, plainPassword, admin.id);
      lot4Rows.push({ ...spec, plainPassword, action });
      console.log(
        `${action === "created" ? "Created" : "Updated"} [LOT4 ${spec.group}] ${spec.email}`
      );
    }
  }

  const lot3Files = await writeLotCredentialsDoc("LOT3", lot3Credentials);
  const lot4Files = await writeLotCredentialsDoc("LOT4", lot4Rows);

  printCredentialsTable("LOT3", lot3Credentials);
  printCredentialsTable("LOT4", lot4Rows);

  console.log(`\nLOT-3 document: ${lot3Files.docxPath}`);
  console.log(`LOT-3 backup:   ${lot3Files.txtPath}`);
  console.log(`LOT-4 document: ${lot4Files.docxPath}`);
  console.log(`LOT-4 backup:   ${lot4Files.txtPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
