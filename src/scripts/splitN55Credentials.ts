import "dotenv/config";
import fs from "fs";
import path from "path";
import prisma from "../utils/prisma";
import {
  type CredentialRow,
  getCredentialsPaths,
  parseExistingCredentialsTxt,
  printCredentialsTable,
  writeLotCredentialsDoc,
} from "./n55UserSeedShared";

async function main() {
  const legacyCombinedPath = path.join(
    process.cwd(),
    "credentials",
    "N55-LOT3-User-Credentials.txt"
  );

  let lot3Rows: CredentialRow[] = [];
  let lot4Rows: CredentialRow[] = [];

  if (fs.existsSync(legacyCombinedPath)) {
    const allRows = parseExistingCredentialsTxt(legacyCombinedPath);
    lot3Rows = allRows.filter((row) => row.lot === "LOT3");
    lot4Rows = allRows.filter((row) => row.lot === "LOT4");
    console.log(
      `Loaded combined legacy file: ${lot3Rows.length} LOT-3, ${lot4Rows.length} LOT-4 rows.`
    );
  }

  const lot3Path = getCredentialsPaths("LOT3").txtPath;
  const lot4Path = getCredentialsPaths("LOT4").txtPath;

  if (lot3Rows.length === 0 && fs.existsSync(lot3Path)) {
    lot3Rows = parseExistingCredentialsTxt(lot3Path);
  }
  if (lot4Rows.length === 0 && fs.existsSync(lot4Path)) {
    lot4Rows = parseExistingCredentialsTxt(lot4Path);
  }

  if (lot3Rows.length === 0 && lot4Rows.length === 0) {
    throw new Error(
      "No credentials found. Run seed:n55-lot3-users and seed:n55-lot4-users first."
    );
  }

  console.log("\n=== Writing separate LOT-3 and LOT-4 credential files ===\n");

  if (lot3Rows.length > 0) {
    const lot3 = await writeLotCredentialsDoc("LOT3", lot3Rows);
    printCredentialsTable("LOT3", lot3Rows);
    console.log(`\nLOT-3 document: ${lot3.docxPath}`);
    console.log(`LOT-3 backup:   ${lot3.txtPath}`);
  }

  if (lot4Rows.length > 0) {
    const lot4 = await writeLotCredentialsDoc("LOT4", lot4Rows);
    printCredentialsTable("LOT4", lot4Rows);
    console.log(`\nLOT-4 document: ${lot4.docxPath}`);
    console.log(`LOT-4 backup:   ${lot4.txtPath}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
