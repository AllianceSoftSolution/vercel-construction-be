import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeadingLevel,
} from "docx";
import { UserRole } from "@prisma/client";
import prisma from "../utils/prisma";

export type UserSpec = {
  lot: "LOT3" | "LOT4";
  name: string;
  email: string;
  employeeId: string;
  role: UserRole;
  isHead?: boolean;
  group: string;
};

export type CredentialRow = UserSpec & {
  plainPassword: string;
  action?: "created" | "updated" | "preserved";
};

export function generateUniquePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*!";
  const all = upper + lower + digits + symbols;

  const pick = (chars: string) => chars[crypto.randomInt(0, chars.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const remaining = Array.from({ length: 8 }, () => pick(all));
  const chars = [...required, ...remaining];

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export async function upsertUser(
  spec: UserSpec,
  plainPassword: string,
  createdBy: string
): Promise<"created" | "updated"> {
  const hashedPassword = await bcrypt.hash(plainPassword, 12);
  const existing = await prisma.user.findUnique({ where: { email: spec.email } });

  if (existing) {
    await prisma.user.update({
      where: { email: spec.email },
      data: {
        name: spec.name,
        password: hashedPassword,
        role: spec.role,
        employeeId: spec.employeeId,
        isHead: spec.isHead ?? false,
        isActive: true,
        isDeleted: false,
      },
    });
    return "updated";
  }

  const employeeTaken = await prisma.user.findUnique({
    where: { employeeId: spec.employeeId },
  });
  if (employeeTaken) {
    throw new Error(
      `Employee ID ${spec.employeeId} is already used by ${employeeTaken.email}`
    );
  }

  await prisma.user.create({
    data: {
      name: spec.name,
      email: spec.email,
      password: hashedPassword,
      employeeId: spec.employeeId,
      role: spec.role,
      isHead: spec.isHead ?? false,
      isActive: true,
      isDeleted: false,
      createdBy,
    },
  });
  return "created";
}

/**
 * Create headStoreInchargeAssignment for Head Store users.
 * This assigns them to the N55 LOT3 or LOT4 project based on their lot.
 * Call this after upsertUser for users with isHead: true and role: STORE_INCHARGE.
 */
export async function ensureHeadStoreAssignment(
  spec: UserSpec,
  createdBy: string
): Promise<void> {
  if (!spec.isHead || spec.role !== "STORE_INCHARGE") {
    return; // Only for Head Store Incharge users
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email: spec.email },
    select: { id: true },
  });
  if (!user) {
    console.warn(`User ${spec.email} not found, skipping assignment`);
    return;
  }

  // Find the project based on lot
  const projectPattern = spec.lot === "LOT3" ? "LOT-3" : "LOT-4";
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        { name: { contains: projectPattern, mode: "insensitive" } },
        { code: { contains: projectPattern, mode: "insensitive" } },
      ],
      isDeleted: false,
    },
    select: { id: true, name: true },
  });

  if (!project) {
    console.warn(`No ${spec.lot} project found, skipping assignment for ${spec.email}`);
    return;
  }

  // Upsert the headStoreInchargeAssignment
  await prisma.headStoreInchargeAssignment.upsert({
    where: {
      userId_projectId: {
        userId: user.id,
        projectId: project.id,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      userId: user.id,
      projectId: project.id,
      isActive: true,
      createdBy,
    },
  });

  console.log(`  → Assigned ${spec.email} to project "${project.name}"`);
}

function tableCell(text: string, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
  });
}

export function getCredentialsPaths(lot: "LOT3" | "LOT4") {
  const outputDir = path.join(process.cwd(), "credentials");
  const label = lot === "LOT3" ? "LOT3" : "LOT4";
  return {
    outputDir,
    docxPath: path.join(outputDir, `N55-${label}-User-Credentials.docx`),
    txtPath: path.join(outputDir, `N55-${label}-User-Credentials.txt`),
  };
}

export async function writeLotCredentialsDoc(
  lot: "LOT3" | "LOT4",
  rows: CredentialRow[]
) {
  const { outputDir, docxPath, txtPath } = getCredentialsPaths(lot);
  fs.mkdirSync(outputDir, { recursive: true });

  const generatedAt = new Date().toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const title =
    lot === "LOT3"
      ? "N-55 LOT-3 User Credentials"
      : "N-55 LOT-4 User Credentials";

  const headerRow = new TableRow({
    children: [
      tableCell("#", true),
      tableCell("Role Group", true),
      tableCell("Display Name", true),
      tableCell("Email", true),
      tableCell("Password", true),
      tableCell("Employee ID", true),
    ],
  });

  const dataRows = rows.map((row, index) =>
    new TableRow({
      children: [
        tableCell(String(index + 1)),
        tableCell(row.group),
        tableCell(row.name),
        tableCell(row.email),
        tableCell(row.plainPassword),
        tableCell(row.employeeId),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun(title)],
          }),
          new Paragraph({
            children: [new TextRun(`Generated: ${generatedAt}`)],
          }),
          new Paragraph({
            children: [
              new TextRun(
                "Note: Head Store users are automatically assigned to their respective project. Other role assignments (Section Store, PM, CM, etc.) must be configured manually in the admin panel."
              ),
            ],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);

  const txtLines = [
    title,
    `Generated: ${generatedAt}`,
    "Note: Head Store users are automatically assigned to their project. Other role assignments must be configured manually.",
    "",
    "# | Role Group | Display Name | Email | Password | Employee ID",
    "-".repeat(120),
    ...rows.map(
      (row, index) =>
        `${String(index + 1).padStart(2, "0")} | ${row.group} | ${row.name} | ${row.email} | ${row.plainPassword} | ${row.employeeId}`
    ),
  ];
  fs.writeFileSync(txtPath, txtLines.join("\n"), "utf8");

  return { docxPath, txtPath };
}

export async function writeCredentialsDoc(rows: CredentialRow[]) {
  const lot3Rows = rows.filter((row) => row.lot === "LOT3");
  const lot4Rows = rows.filter((row) => row.lot === "LOT4");
  const lot3 = lot3Rows.length
    ? await writeLotCredentialsDoc("LOT3", lot3Rows)
    : null;
  const lot4 = lot4Rows.length
    ? await writeLotCredentialsDoc("LOT4", lot4Rows)
    : null;
  return {
    docxPath: lot3?.docxPath ?? lot4?.docxPath ?? "",
    txtPath: lot3?.txtPath ?? lot4?.txtPath ?? "",
    lot3,
    lot4,
  };
}

export function parseExistingCredentialsTxt(
  txtPath: string,
  emailFilter?: (email: string) => boolean
): CredentialRow[] {
  if (!fs.existsSync(txtPath)) return [];

  const lines = fs.readFileSync(txtPath, "utf8").split("\n");
  const rows: CredentialRow[] = [];

  for (const line of lines) {
    if (!line.includes("|") || line.startsWith("-") || line.startsWith("#")) {
      continue;
    }

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 6) continue;

    let lot: "LOT3" | "LOT4";
    let group: string;
    let name: string;
    let email: string;
    let plainPassword: string;
    let employeeId: string;

    if (parts[1] === "LOT3" || parts[1] === "LOT4") {
      if (parts.length < 7) continue;
      lot = parts[1];
      group = parts[2];
      name = parts[3];
      email = parts[4];
      plainPassword = parts[5];
      employeeId = parts[6];
    } else {
      group = parts[1];
      name = parts[2];
      email = parts[3];
      plainPassword = parts[4];
      employeeId = parts[5];
      lot = email.toLowerCase().includes("lot4") ? "LOT4" : "LOT3";
    }

    if (emailFilter && !emailFilter(email)) continue;

    rows.push({
      lot,
      group,
      name,
      email,
      plainPassword,
      employeeId,
      role: UserRole.ACCOUNTANT,
      action: "preserved",
    });
  }

  return rows;
}

export async function findAdminUser() {
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

  return admin;
}

export function printCredentialsTable(
  lot: "LOT3" | "LOT4",
  rows: CredentialRow[]
) {
  const title =
    lot === "LOT3" ? "N55 LOT-3 USER CREDENTIALS" : "N55 LOT-4 USER CREDENTIALS";
  console.log("\n" + "=".repeat(100));
  console.log(title);
  console.log("=".repeat(100));
  console.log(
    "#".padEnd(4) +
      "Role Group".padEnd(32) +
      "Email".padEnd(38) +
      "Password".padEnd(16) +
      "Employee ID"
  );
  console.log("-".repeat(100));
  rows.forEach((row, index) => {
    console.log(
      String(index + 1).padEnd(4) +
        row.group.padEnd(32) +
        row.email.padEnd(38) +
        row.plainPassword.padEnd(16) +
        row.employeeId
    );
  });
  console.log("=".repeat(100));
}
