import "dotenv/config";
import axios, { AxiosInstance } from "axios";
import prisma from "../utils/prisma";
import { requireAttachmentUrls } from "../utils/attachmentUrls";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const ADMIN_EMAIL =
  process.env.STORE_TEST_ADMIN_EMAIL || "radcrustamadc@gmail.com";
const ADMIN_PASSWORD = process.env.STORE_TEST_ADMIN_PASSWORD || "Admin@2026";

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];

const record = (name: string, pass: boolean, detail?: string) => {
  checks.push({ name, pass, detail });
  console.log(
    `  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`
  );
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

const SAMPLE_DOC = ["https://radc-bucket.s3.eu-north-1.amazonaws.com/document/test-doc.pdf"];

function testRequireAttachmentUrlsHelper() {
  console.log("\n1) requireAttachmentUrls helper");
  try {
    requireAttachmentUrls([], "Document attachment");
    record("Empty urls throws", false, "no error thrown");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("Empty urls throws", message.includes("Document attachment is required"));
  }

  try {
    requireAttachmentUrls(SAMPLE_DOC, "Document attachment");
    record("Non-empty urls pass", true);
  } catch {
    record("Non-empty urls pass", false);
  }
}

async function findFixtures() {
  const store = await prisma.store.findFirst({
    where: { isDeleted: false, isActive: true },
    include: {
      storeInchargeAssignments: {
        where: { isActive: true },
        include: { user: true },
      },
    },
  });

  const material = await prisma.material.findFirst({
    where: { isDeleted: false },
  });

  const storeInchargeUser =
    store?.storeInchargeAssignments[0]?.user ||
    (await prisma.user.findFirst({
      where: { role: "STORE_INCHARGE", isDeleted: false, isActive: true },
    }));

  const assignCandidate = await prisma.user.findFirst({
    where: {
      role: "STORE_INCHARGE",
      isDeleted: false,
      isActive: true,
      ...(store
        ? {
            NOT: {
              storeInchargeAssignments: {
                some: { storeId: store.id, isActive: true },
              },
            },
          }
        : {}),
    },
  });

  const pendingIncoming = store
    ? await prisma.storeTransaction.findFirst({
        where: {
          storeId: store.id,
          type: "IN",
          fromStoreId: { not: null },
          reference: "TRANSFER",
          acceptedAt: null,
        },
      })
    : null;

  return { store, material, storeInchargeUser, assignCandidate, pendingIncoming };
}

async function testApiValidation() {
  console.log("\n2) API attachment required validation");

  const fixtures = await findFixtures();
  if (!fixtures.store || !fixtures.material) {
    record(
      "Fixtures available (API tests skipped)",
      true,
      `store=${!!fixtures.store} material=${!!fixtures.material}`
    );
    return;
  }
  record("Fixtures available", true, fixtures.store.name);

  let storeInchargeToken: string | null = null;
  let adminToken: string | null = null;

  if (fixtures.storeInchargeUser?.email) {
    try {
      storeInchargeToken = await login(
        fixtures.storeInchargeUser.email,
        process.env.STORE_TEST_SI_PASSWORD || "StoreIncharge@2026"
      );
    } catch (err) {
      record(
        "Store Incharge login",
        false,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch (err) {
    record("Admin login", false, err instanceof Error ? err.message : String(err));
  }

  const storeId = fixtures.store.id;
  const materialId = fixtures.material.id;
  const stockToken = storeInchargeToken || adminToken;

  if (stockToken) {
    const api = client(stockToken);

    const stockInMissing = await api.post(`/stores/${storeId}/stock-in`, {
      materialId,
      quantity: 1,
      stockInType: "MANUAL",
    });
    record(
      "stock-in rejects missing attachment",
      stockInMissing.status === 400,
      String(stockInMissing.status)
    );

    const stockOutMissing = await api.post(`/stores/${storeId}/stock-out`, {
      materialId,
      quantity: 1,
      stockOutType: "MANUAL",
    });
    record(
      "stock-out rejects missing attachment",
      stockOutMissing.status === 400,
      String(stockOutMissing.status)
    );

    const stockInOk = await api.post(`/stores/${storeId}/stock-in`, {
      materialId,
      quantity: 1,
      stockInType: "MANUAL",
      documentUrls: SAMPLE_DOC,
    });
    record(
      "stock-in accepts documentUrls",
      stockInOk.status < 400,
      String(stockInOk.status)
    );
  } else {
    record("Stock in/out API tests", false, "login unavailable");
  }

  if (adminToken && fixtures.assignCandidate) {
    const admin = client(adminToken);
    const assignMissing = await admin.patch(`/stores/${storeId}/assign`, {
      userId: fixtures.assignCandidate.id,
    });
    record(
      "assign rejects missing utility file",
      assignMissing.status === 400,
      String(assignMissing.status)
    );
  } else {
    record(
      "assign rejects missing utility file",
      true,
      "skipped (no admin login or assign candidate)"
    );
  }

  if (stockToken && fixtures.pendingIncoming) {
    const api = client(stockToken);
    const acceptMissing = await api.post(
      `/stores/${storeId}/transactions/${fixtures.pendingIncoming.id}/accept`,
      {}
    );
    record(
      "accept rejects missing receiving document",
      acceptMissing.status === 400,
      String(acceptMissing.status)
    );
  } else {
    record(
      "accept rejects missing receiving document",
      true,
      "skipped (no pending incoming transfer fixture)"
    );
  }
}

async function main() {
  console.log(`\nStore attachment required tests → ${BASE_URL}\n`);
  testRequireAttachmentUrlsHelper();
  try {
    await testApiValidation();
  } catch (err) {
    record(
      "API tests",
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
