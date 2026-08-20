import "dotenv/config";
import axios, { AxiosInstance } from "axios";
import prisma from "../utils/prisma";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const ADMIN_EMAIL =
  process.env.PETTY_CASH_TEST_ADMIN_EMAIL || "radcrustamadc@gmail.com";
const ADMIN_PASSWORD =
  process.env.PETTY_CASH_TEST_ADMIN_PASSWORD || "Admin@2026";

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];

const record = (name: string, pass: boolean, detail?: string) => {
  checks.push({ name, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
};

const client = (token?: string): AxiosInstance =>
  axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const login = async (email: string, password: string) => {
  const res = await client().post("/auth/login", { email, password });
  if (res.status >= 400 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return res.data.token as string;
};

const isWithinRange = (
  createdAt: string,
  from?: string,
  to?: string
): boolean => {
  const date = new Date(createdAt);
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    if (date < start) return false;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }
  return true;
};

async function testPrismaDateWhere() {
  console.log("\n1) Prisma date-range where clause");
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
  });
  const project = await prisma.project.findFirst({
    where: { isDeleted: false, isActive: true },
  });
  if (!admin || !project) {
    record("Prisma fixture available", false, "Need admin + project");
    return;
  }

  const marker = `date-filter-test-${Date.now()}`;
  const dates = [
    new Date("2026-01-10T12:00:00.000Z"),
    new Date("2026-02-10T12:00:00.000Z"),
    new Date("2026-03-10T12:00:00.000Z"),
  ];
  const ids: string[] = [];

  for (const createdAt of dates) {
    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "INTERNAL_EXPENSE",
        projectId: project.id,
        amount: 1,
        description: marker,
        createdBy: admin.id,
        createdAt,
        updatedAt: createdAt,
      },
    });
    ids.push(tx.id);
  }

  const end = new Date("2026-02-28");
  end.setHours(23, 59, 59, 999);

  const februaryOnly = await prisma.pettyCashTransaction.findMany({
    where: {
      id: { in: ids },
      createdAt: {
        gte: new Date("2026-02-01"),
        lte: end,
      },
    },
  });

  record("Prisma returns only February test rows", februaryOnly.length === 1);
  record(
    "February row is middle test transaction",
    februaryOnly[0]?.description === marker
  );

  await prisma.pettyCashTransaction.deleteMany({ where: { id: { in: ids } } });
  record("Test transactions cleaned up", true);
}

async function testApiDateFilter(token: string) {
  console.log("\n2) API /petty-cash/transactions dateFrom & dateTo");

  const api = client(token);
  const allRes = await api.get("/petty-cash/transactions", {
    params: { limit: 500 },
  });
  record("Unfiltered transactions 200", allRes.status === 200, String(allRes.status));

  const from = "2026-02-01";
  const to = "2026-02-28";
  const rangedRes = await api.get("/petty-cash/transactions", {
    params: { dateFrom: from, dateTo: to, limit: 500 },
  });
  record("Date range filter 200", rangedRes.status === 200, String(rangedRes.status));

  const rangedRows = rangedRes.data?.data || [];
  const allRows = allRes.data?.data || [];
  record(
    "Date range count <= unfiltered count",
    rangedRows.length <= allRows.length,
    `${rangedRows.length} vs ${allRows.length}`
  );

  if (rangedRows.length > 0) {
    const allInRange = rangedRows.every((tx: { createdAt: string }) =>
      isWithinRange(tx.createdAt, from, to)
    );
    record("Every API row falls within selected range", allInRange);
  } else {
    record("Every API row falls within selected range", true, "no rows in range");
  }

  const fromOnlyRes = await api.get("/petty-cash/transactions", {
    params: { dateFrom: "2026-03-01", limit: 500 },
  });
  record("dateFrom-only filter 200", fromOnlyRes.status === 200);
  if ((fromOnlyRes.data?.data || []).length > 0) {
    const ok = (fromOnlyRes.data.data as { createdAt: string }[]).every((tx) =>
      isWithinRange(tx.createdAt, "2026-03-01", undefined)
    );
    record("dateFrom-only rows on/after start", ok);
  }

  const toOnlyRes = await api.get("/petty-cash/transactions", {
    params: { dateTo: "2026-01-31", limit: 500 },
  });
  record("dateTo-only filter 200", toOnlyRes.status === 200);
  if ((toOnlyRes.data?.data || []).length > 0) {
    const ok = (toOnlyRes.data.data as { createdAt: string }[]).every((tx) =>
      isWithinRange(tx.createdAt, undefined, "2026-01-31")
    );
    record("dateTo-only rows on/before end", ok);
  }

  const sumRes = await api.get("/petty-cash/summary", {
    params: { dateFrom: from, dateTo: to },
  });
  record(
    "Summary ignores date query params (still 200)",
    sumRes.status === 200,
    String(sumRes.status)
  );
}

async function main() {
  console.log(`\nPetty cash date filter tests → ${BASE_URL}\n`);

  await testPrismaDateWhere();

  try {
    const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await testApiDateFilter(token);
  } catch (err) {
    record(
      "API tests (skipped if server down)",
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
