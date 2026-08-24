import "dotenv/config";
import axios from "axios";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "radcrustamadc@gmail.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Admin@2026";
const HOA_EMAIL = process.env.TEST_HOA_EMAIL || "HOA@radc.com";
const HOA_PASSWORD = process.env.TEST_HOA_PASSWORD || "Radc@2026";

const checks: { name: string; pass: boolean; detail?: string }[] = [];
const record = (name: string, pass: boolean, detail?: string) => {
  checks.push({ name, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` (${detail})` : ""}`);
};

async function login(email: string, password: string) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${res.data.token}` },
  });
}

async function main() {
  console.log(`\nPetty cash visibility & audit log tests → ${BASE_URL}\n`);

  const adminApi = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const hoaApi = await login(HOA_EMAIL, HOA_PASSWORD);

  const byProject = await adminApi.get("/petty-cash/summary/by-project");
  const projects = byProject.data?.data || [];
  const hoProject = projects.find(
    (p: { code?: string }) => p.code === "HO-Petty"
  );

  record("Admin sees Head Office Petty Cash project", Boolean(hoProject));
  record(
    "HO project uses standard project balances",
    hoProject != null &&
      typeof hoProject.totalFunded === "number" &&
      hoProject.isHeadOfficePettyCash !== true,
    hoProject ? `funded=${hoProject.totalFunded}` : "missing"
  );

  const auditLog = await adminApi.get("/petty-cash/admin/audit-log");
  record("Admin audit log 200", auditLog.status === 200);
  record(
    "Audit log has credited/debited/remaining summary",
    auditLog.data?.data?.summary?.totalCredited != null &&
      auditLog.data?.data?.summary?.totalDebited != null &&
      auditLog.data?.data?.summary?.remainingBalance != null
  );
  record(
    "Audit log returns entries array",
    Array.isArray(auditLog.data?.data?.entries)
  );

  const entries = auditLog.data?.data?.entries || [];
  const hasCredit = entries.some((e: { direction: string }) => e.direction === "CREDIT");
  const hasDebit = entries.some((e: { direction: string }) => e.direction === "DEBIT");
  record(
    "Audit log includes credit entries when funded",
    (auditLog.data?.data?.summary?.totalCredited || 0) === 0 || hasCredit
  );
  record(
    "Audit log includes debit entries when distributed",
    (auditLog.data?.data?.summary?.totalDebited || 0) === 0 || hasDebit
  );

  let hoaLogStatus = 0;
  try {
    await hoaApi.get("/petty-cash/admin/audit-log");
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      hoaLogStatus = err.response?.status ?? 0;
    }
  }
  record("Non-admin blocked from audit log", hoaLogStatus === 403);

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exitCode = 1;
});
