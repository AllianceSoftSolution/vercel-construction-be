import "dotenv/config";
import axios, { AxiosInstance } from "axios";
import prisma from "../utils/prisma";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const PASSWORD = "PettyCash@2026";

type Check = { name: string; pass: boolean; detail?: string };

const checks: Check[] = [];

const record = (name: string, pass: boolean, detail?: string) => {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
};

const client = (token?: string): AxiosInstance =>
  axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const login = async (email: string) => {
  const res = await client().post("/auth/login", { email, password: PASSWORD });
  if (res.status >= 400 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return { token: res.data.token as string, user: res.data.user || res.data };
};

async function main() {
  console.log(`\nPetty cash role access tests → ${BASE_URL}\n`);

  const tp1 = await prisma.project.findFirst({
    where: { code: "TP-001", isDeleted: false },
    include: { sections: { where: { isDeleted: false } } },
  });
  const tp2 = await prisma.project.findFirst({
    where: { code: "TP-002", isDeleted: false },
    include: { sections: { where: { isDeleted: false } } },
  });
  const tp3 = await prisma.project.findFirst({
    where: { code: "TP-003", isDeleted: false },
  });

  if (!tp1 || !tp2 || !tp3) {
    throw new Error("Test projects TP-001/TP-002/TP-003 not found. Run seedPettyCashTestUsers.ts first.");
  }

  const hoa = await login("tp_hoa_1@gmail.com");
  const pa1 = await login("tp1_pa_1@gmail.com");
  const pa2 = await login("tp2_pa_1@gmail.com");
  const sa1 = await login("tp1_sa_1@gmail.com");
  const pm1 = await login("tp1_pm_1@gmail.com");

  const hoaApi = client(hoa.token);
  const pa1Api = client(pa1.token);
  const pa2Api = client(pa2.token);
  const sa1Api = client(sa1.token);
  const pm1Api = client(pm1.token);

  console.log("1) Summary permissions");
  const hoaSum = await hoaApi.get("/petty-cash/summary");
  record(
    "HO summary 200",
    hoaSum.status === 200,
    String(hoaSum.status)
  );
  record(
    "HO roleScope is HEAD_OFFICE_ACCOUNTANT",
    hoaSum.data?.data?.roleScope === "HEAD_OFFICE_ACCOUNTANT",
    hoaSum.data?.data?.roleScope
  );
  record("HO canAddFunding", hoaSum.data?.data?.canAddFunding === true);
  record("HO canDistribute", hoaSum.data?.data?.canDistribute === true);
  record("HO canAddInternalExpense", hoaSum.data?.data?.canAddInternalExpense === true);
  record(
    "HO summary includes distributable remaining",
    typeof hoaSum.data?.data?.headOfficeDistributableRemaining === "number",
    String(hoaSum.data?.data?.headOfficeDistributableRemaining)
  );

  const paSum = await pa1Api.get("/petty-cash/summary");
  record(
    "PA roleScope is PROJECT_ACCOUNTANT",
    paSum.data?.data?.roleScope === "PROJECT_ACCOUNTANT",
    paSum.data?.data?.roleScope
  );
  record("PA cannot add funding", paSum.data?.data?.canAddFunding === false);
  record("PA can distribute", paSum.data?.data?.canDistribute === true);
  record("PA can add internal expense", paSum.data?.data?.canAddInternalExpense === true);
  record(
    "PA can add section expense",
    paSum.data?.data?.canAddSectionExpense === true
  );

  const saSum = await sa1Api.get("/petty-cash/summary");
  record(
    "SA roleScope is SECTION_ACCOUNTANT",
    saSum.data?.data?.roleScope === "SECTION_ACCOUNTANT",
    saSum.data?.data?.roleScope
  );
  record("SA cannot add funding", saSum.data?.data?.canAddFunding === false);
  record("SA cannot distribute", saSum.data?.data?.canDistribute === false);
  record("SA can add section expense", saSum.data?.data?.canAddSectionExpense === true);

  const pmSum = await pm1Api.get("/petty-cash/summary");
  record(
    "PM roleScope is PROJECT_MANAGER",
    pmSum.data?.data?.roleScope === "PROJECT_MANAGER",
    pmSum.data?.data?.roleScope
  );
  record("PM cannot add funding", pmSum.data?.data?.canAddFunding === false);

  console.log("\n2) Project list scoping");
  const hoaProjects = await hoaApi.get("/petty-cash/summary/by-project");
  const pa1Projects = await pa1Api.get("/petty-cash/summary/by-project");
  const pa2Projects = await pa2Api.get("/petty-cash/summary/by-project");
  const saProjects = await sa1Api.get("/petty-cash/summary/by-project");

  const pa1Codes = (pa1Projects.data?.data || []).map((p: { code: string }) => p.code);
  const pa2Codes = (pa2Projects.data?.data || []).map((p: { code: string }) => p.code);

  record("HO sees projects", (hoaProjects.data?.data || []).length > 0);
  record(
    "PA1 only TP-001",
    pa1Codes.length === 1 && pa1Codes[0] === "TP-001",
    pa1Codes.join(",")
  );
  record(
    "PA2 only TP-002",
    pa2Codes.length === 1 && pa2Codes[0] === "TP-002",
    pa2Codes.join(",")
  );
  record("SA by-project is empty", Array.isArray(saProjects.data?.data) && saProjects.data.data.length === 0);

  console.log("\n3) Project balance access");
  const pa1Own = await pa1Api.get(`/petty-cash/projects/${tp1.id}/balance`);
  const pa1Other = await pa1Api.get(`/petty-cash/projects/${tp2.id}/balance`);
  record("PA1 can open assigned project", pa1Own.status === 200, String(pa1Own.status));
  record("PA1 blocked from other project", pa1Other.status === 403, String(pa1Other.status));

  const pa1Sections = await pa1Api.get(`/petty-cash/projects/${tp1.id}/sections`);
  const sectionCount = (pa1Sections.data?.data || []).length;
  record(
    "PA1 sees all sections of assigned project",
    pa1Sections.status === 200 && sectionCount >= 2,
    `status=${pa1Sections.status} count=${sectionCount}`
  );

  console.log("\n4) Funding (HO yes, PA/SA/PM no)");
  const fundingBody = { projectId: tp1.id, amount: 1, description: "role-access-test" };
  const paFund = await pa1Api.post("/petty-cash/funding", fundingBody);
  const saFund = await sa1Api.post("/petty-cash/funding", fundingBody);
  const pmFund = await pm1Api.post("/petty-cash/funding", fundingBody);
  record("PA funding 403", paFund.status === 403, String(paFund.status));
  record("SA funding 403", saFund.status === 403, String(saFund.status));
  record("PM funding 403", pmFund.status === 403, String(pmFund.status));

  const hoaFundProbe = await hoaApi.post("/petty-cash/funding", {
    projectId: "nonexistent-project-id",
    amount: 1,
    description: "hoa-access-test",
  });
  record(
    "HO funding is allowed (404 for missing project, not 403)",
    hoaFundProbe.status === 404,
    String(hoaFundProbe.status)
  );

  console.log("\n5) Internal expense / distribution authorization");
  const paInternalOther = await pa1Api.post("/petty-cash/internal-expense", {
    projectId: tp2.id,
    expenseHeadId: "000000000000000000000000",
    amount: 1,
  });
  record(
    "PA internal expense on other project blocked",
    paInternalOther.status === 403,
    String(paInternalOther.status)
  );

  const paDistOther = await pa1Api.post("/petty-cash/distribution", {
    projectId: tp2.id,
    sectionId: tp2.sections[0]?.id,
    amount: 1,
  });
  record(
    "PA distribution on other project blocked",
    paDistOther.status === 403,
    String(paDistOther.status)
  );

  const saDist = await sa1Api.post("/petty-cash/distribution", {
    projectId: tp1.id,
    sectionId: tp1.sections[0]?.id,
    amount: 1,
  });
  record("SA cannot distribute", saDist.status === 403, String(saDist.status));

  console.log("\n6) Transactions scoped to assigned projects");
  const paTx = await pa1Api.get("/petty-cash/transactions", { params: { limit: 100 } });
  const txProjectIds = new Set(
    (paTx.data?.data || []).map((t: { project?: { id: string } }) => t.project?.id)
  );
  record(
    "PA1 transactions only TP-001",
    paTx.status === 200 && [...txProjectIds].every((id) => !id || id === tp1.id),
    `status=${paTx.status} projects=${txProjectIds.size}`
  );

  console.log("\n7) Role isolation (no cross-section / cross-project leak)");
  const sa2 = await login("tp1_sa_2@gmail.com");
  const sa2Api = client(sa2.token);
  const otherSectionId = tp1.sections.find((s) => s.id !== tp1.sections[0]?.id)?.id;

  const saBySection = await sa1Api.get("/petty-cash/summary/by-section");
  const saSectionIds = (saBySection.data?.data || []).map((s: { id: string }) => s.id);
  record(
    "SA1 only sees assigned section(s)",
    saBySection.status === 200 &&
      saSectionIds.length > 0 &&
      saSectionIds.every((id: string) => id === tp1.sections[0]?.id),
    saSectionIds.join(",")
  );

  const saTx = await sa1Api.get("/petty-cash/transactions", { params: { limit: 100 } });
  const saTxSectionIds = new Set(
    (saTx.data?.data || []).map((t: { section?: { id: string } }) => t.section?.id)
  );
  record(
    "SA1 transactions stay on assigned section",
    saTx.status === 200 &&
      [...saTxSectionIds].every((id) => !id || id === tp1.sections[0]?.id),
    `status=${saTx.status} sections=${[...saTxSectionIds].join(",")}`
  );

  if (otherSectionId) {
    const saOtherSection = await sa1Api.get("/petty-cash/transactions", {
      params: { sectionId: otherSectionId, limit: 50 },
    });
    record(
      "SA1 cannot query another section's transactions",
      saOtherSection.status === 200 && (saOtherSection.data?.data || []).length === 0,
      `count=${(saOtherSection.data?.data || []).length}`
    );
  }

  const pa1Tp3 = await pa1Api.get(`/petty-cash/projects/${tp3.id}/balance`);
  record("PA1 blocked from TP-003", pa1Tp3.status === 403, String(pa1Tp3.status));

  const pa13 = await login("tp13_pa_1@gmail.com");
  const pa13Api = client(pa13.token);
  const pa13Projects = await pa13Api.get("/petty-cash/summary/by-project");
  const pa13Codes = (pa13Projects.data?.data || []).map((p: { code: string }) => p.code).sort();
  record(
    "Shared-project PA sees TP-001 and TP-003 only",
    pa13Codes.join(",") === "TP-001,TP-003",
    pa13Codes.join(",")
  );
  const pa13Tp2 = await pa13Api.get(`/petty-cash/projects/${tp2.id}/balance`);
  record("Shared-project PA blocked from TP-002", pa13Tp2.status === 403, String(pa13Tp2.status));

  const sa2Projects = await sa2Api.get("/petty-cash/summary/by-section");
  const sa2Ids = (sa2Projects.data?.data || []).map((s: { id: string }) => s.id);
  record(
    "SA2 does not see SA1 section",
    !sa2Ids.includes(tp1.sections[0]?.id) && sa2Ids.includes(otherSectionId),
    sa2Ids.join(",")
  );

  const failed = checks.filter((c) => !c.pass);
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    console.log("Failed:");
    failed.forEach((f) => console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
    process.exitCode = 1;
  } else {
    console.log("All petty cash role-access API checks passed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
