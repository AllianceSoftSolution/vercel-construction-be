import "dotenv/config";
import axios, { AxiosInstance } from "axios";
import prisma from "../utils/prisma";
import { getHeadOfficeDistributableRemaining } from "../utils/pettyCashAccess";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const ADMIN_EMAIL = "radcrustamadc@gmail.com";
const ADMIN_PASSWORD = "Admin@2026";
const HOA_EMAIL = "HOA@radc.com";
const HOA_PASSWORD = "Radc@2026";

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

async function main() {
  console.log(`\nPetty cash pool flow tests → ${BASE_URL}\n`);

  const project = await prisma.project.findFirst({
    where: { code: "N55-LOT3", isDeleted: false },
    select: { id: true, code: true },
  });
  if (!project) throw new Error("N55-LOT3 not found");

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const hoaToken = await login(HOA_EMAIL, HOA_PASSWORD);
  const adminApi = client(adminToken);
  const hoaApi = client(hoaToken);

  console.log("1) Summary permissions");
  const adminSum = await adminApi.get("/petty-cash/summary");
  record("Admin summary 200", adminSum.status === 200, String(adminSum.status));
  record(
    "Admin canAddPettyCashPool",
    adminSum.data?.data?.canAddPettyCashPool === true
  );
  record(
    "Admin sees pool remaining",
    typeof adminSum.data?.data?.headOfficeDistributableRemaining === "number",
    String(adminSum.data?.data?.headOfficeDistributableRemaining)
  );

  const hoaSum = await hoaApi.get("/petty-cash/summary");
  record(
    "HOA sees pool remaining",
    typeof hoaSum.data?.data?.headOfficeDistributableRemaining === "number"
  );
  record(
    "HOA cannot add pool",
    hoaSum.data?.data?.canAddPettyCashPool !== true
  );

  console.log("\n2) Add petty cash pool (admin)");
  const poolAdd = await adminApi.post("/petty-cash/pool", {
    amount: 1000,
    description: "pool-flow-test",
    proofUrls: ["https://example.com/proof-pool-test.pdf"],
  });
  record("Admin add pool 201", poolAdd.status === 201, String(poolAdd.status));

  const noProof = await adminApi.post("/petty-cash/pool", {
    amount: 10,
    description: "missing-proof",
  });
  record("Pool add requires proof", noProof.status === 400, String(noProof.status));

  const poolRemaining = await getHeadOfficeDistributableRemaining();
  record("Pool remaining increased", poolRemaining > 0, String(poolRemaining));

  console.log("\n3) Distribute to project uses pool");
  const freshSum = await adminApi.get("/petty-cash/summary");
  const available = Number(
    freshSum.data?.data?.headOfficeDistributableRemaining ?? 0
  );
  record("Pool available before distribute", available > 0, String(available));

  const overDist = await adminApi.post("/petty-cash/funding", {
    projectId: project.id,
    amount: available + 1,
    description: "should-fail",
    proofUrls: ["https://example.com/proof-over.pdf"],
  });
  record(
    "Over-distribution blocked",
    overDist.status === 400,
    String(overDist.status)
  );

  const beforeDist = Number(
    (await adminApi.get("/petty-cash/summary")).data?.data
      ?.headOfficeDistributableRemaining ?? 0
  );
  const okDist = await adminApi.post("/petty-cash/funding", {
    projectId: project.id,
    amount: 50,
    description: "pool-flow-test-dist",
    proofUrls: ["https://example.com/proof-dist.pdf"],
  });
  record("Valid distribution 201", okDist.status === 201, String(okDist.status));

  const afterDist = Number(
    (await adminApi.get("/petty-cash/summary")).data?.data
      ?.headOfficeDistributableRemaining ?? 0
  );
  record(
    "Pool reduced after distribution",
    okDist.status === 201 && afterDist <= beforeDist - 50,
    `before=${beforeDist} after=${afterDist}`
  );

  console.log("\n4) HOA distribution from pool");
  const hoaDist = await hoaApi.post("/petty-cash/funding", {
    projectId: project.id,
    amount: 50,
    description: "hoa-pool-test",
    proofUrls: ["https://example.com/proof-hoa.pdf"],
  });
  record("HOA distribute 201", hoaDist.status === 201, String(hoaDist.status));

  const hoaPoolAdd = await hoaApi.post("/petty-cash/pool", {
    amount: 100,
    proofUrls: ["https://example.com/proof-hoa-pool.pdf"],
  });
  record("HOA cannot add pool", hoaPoolAdd.status === 403, String(hoaPoolAdd.status));

  console.log("\n5) HO-Petty excluded from by-project list");
  const byProject = await adminApi.get("/petty-cash/summary/by-project");
  const codes = (byProject.data?.data || []).map((p: { code: string }) => p.code);
  record(
    "HO-Petty not in project list",
    !codes.includes("HO-Petty"),
    codes.join(",")
  );

  const hoPoolProject = await prisma.project.findFirst({
    where: { code: "HO-Petty", isDeleted: false },
    select: { id: true },
  });
  if (hoPoolProject) {
    const distToPool = await adminApi.post("/petty-cash/funding", {
      projectId: hoPoolProject.id,
      amount: 10,
      proofUrls: ["https://example.com/proof-bad.pdf"],
    });
    record(
      "Cannot distribute to HO-Petty project",
      distToPool.status === 400,
      String(distToPool.status)
    );
  }

  const failed = checks.filter((c) => !c.pass);
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    failed.forEach((f) =>
      console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`)
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
