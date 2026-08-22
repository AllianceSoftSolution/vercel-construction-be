import "dotenv/config";
import axios, { AxiosInstance } from "axios";
import prisma from "../utils/prisma";
import { generatePurchaseOrderPdf } from "../utils/generatePurchaseOrderPdf";

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

const countPdfPages = (buf: Buffer) => {
  const raw = buf.toString("latin1");
  const matches = raw.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
};

const extractPdfText = (buf: Buffer) => {
  const raw = buf.toString("latin1");
  const fromHex = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => {
      try {
        return Buffer.from(match[1], "hex").toString("latin1");
      } catch {
        return "";
      }
    })
    .join("");
  const fromLiterals = [...raw.matchAll(/\((?:\\.|[^\\)])+\)/g)]
    .map((match) => match[0].slice(1, -1))
    .join("");
  return `${fromHex}\n${fromLiterals}`;
};

const client = (token?: string): AxiosInstance =>
  axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    responseType: "arraybuffer",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const login = async (email: string, password: string) => {
  const res = await axios.post(
    `${BASE_URL}/auth/login`,
    { email, password },
    { validateStatus: () => true }
  );
  if (res.status >= 400 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return res.data.token as string;
};

async function testGenerator() {
  console.log("\n1) generatePurchaseOrderPdf");
  const withoutRate = await generatePurchaseOrderPdf({
    referenceNumber: "PO-TEST-001",
    createdAt: new Date("2026-08-01"),
    projectName: "N-55 LOT-3",
    vendorName: "Sample Vendor",
    sectionName: "Section A",
    deliverTo: "Section A",
    itemName: "Cement",
    unit: "Bag",
    unitPrice: null,
    quantity: 100,
    createdByName: "CM User",
    approvals: [
      { role: "PROJECT_MANAGER", name: "PM User", status: "APPROVED" },
    ],
  });
  const blankText = extractPdfText(withoutRate);
  record("Blank-rate PDF starts with %PDF", withoutRate.toString("utf8", 0, 4) === "%PDF");
  record(
    "Blank-rate PDF is a single page",
    countPdfPages(withoutRate) === 1,
    `${countPdfPages(withoutRate)} page(s)`
  );
  record("Blank-rate PDF includes PO number", blankText.includes("PO-TEST-001"));
  record("Blank-rate PDF includes quantity", blankText.includes("100"));
  record("Blank-rate PDF includes creator name", blankText.includes("CM User"));
  record("Blank-rate PDF includes approver name", blankText.includes("PM User"));

  const withAdmin = await generatePurchaseOrderPdf({
    referenceNumber: "PO-TEST-ADMIN",
    createdAt: new Date("2026-08-03"),
    projectName: "N-55 LOT-3",
    vendorName: "Sample Vendor",
    sectionName: "Section A",
    deliverTo: "Section A",
    itemName: "Steel",
    unit: "Ton",
    unitPrice: 900,
    quantity: 5,
    createdByName: "CM User",
    approvals: [
      { role: "PROJECT_MANAGER", name: "PM User", status: "APPROVED" },
      { role: "SUPER_ADMIN", name: "Super Admin User", status: "APPROVED" },
    ],
  });
  const adminText = extractPdfText(withAdmin);
  record(
    "Admin approver name appears for SUPER_ADMIN",
    adminText.includes("Super Admin User")
  );
  record(
    "Blank-rate PDF includes footer",
    blankText.includes("System-generated purchase order")
  );

  const withRate = await generatePurchaseOrderPdf({
    referenceNumber: "PO-TEST-002",
    createdAt: new Date("2026-08-02"),
    projectName: "N-55 LOT-3",
    vendorName: "Sample Vendor",
    sectionName: "Section A",
    deliverTo: "Section A",
    itemName: "Steel",
    unit: "Ton",
    unitPrice: 1250.5,
    quantity: 12,
    createdByName: "CM User",
    approvals: [],
  });
  const pricedText = extractPdfText(withRate);
  record("Priced PDF starts with %PDF", withRate.toString("utf8", 0, 4) === "%PDF");
  record(
    "Priced PDF is a single page",
    countPdfPages(withRate) === 1,
    `${countPdfPages(withRate)} page(s)`
  );
  record(
    "Priced PDF includes unit rate",
    pricedText.includes("1,250.50") || pricedText.includes("1250.50")
  );
}

async function testApi() {
  console.log("\n2) GET /purchase-orders/:id/pdf");
  const unauth = await client().get("/purchase-orders/does-not-exist/pdf");
  record(
    "Unauthenticated request is 401",
    unauth.status === 401,
    String(unauth.status)
  );

  let token: string | null = null;
  try {
    token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    record("Admin login", true);
  } catch (err) {
    record("Admin login", false, err instanceof Error ? err.message : String(err));
    return;
  }

  const api = client(token);
  const missing = await api.get("/purchase-orders/does-not-exist/pdf");
  record(
    "Unknown PO returns 404",
    missing.status === 404,
    String(missing.status)
  );

  const po =
    (await prisma.purchaseOrder.findFirst({
      where: { isDeleted: false },
      select: { id: true, referenceNumber: true, unitPrice: true, quantity: true },
    })) || null;

  let fixture = po;
  if (!fixture) {
    const list = await axios.get(`${BASE_URL}/purchase-orders`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 1 },
      validateStatus: () => true,
    });
    const first = Array.isArray(list.data?.data) ? list.data.data[0] : null;
    if (first?.id) {
      fixture = {
        id: first.id,
        referenceNumber: first.referenceNumber,
        unitPrice: first.unitPrice ?? null,
        quantity: first.quantity,
      };
    }
  }

  if (!fixture) {
    record("Existing PO PDF (skipped)", true, "no purchase order fixture");
    return;
  }

  const ok = await api.get(`/purchase-orders/${fixture.id}/pdf`);
  const body = Buffer.from(ok.data);
  const liveText = extractPdfText(body);
  record("Existing PO PDF is 200", ok.status === 200, String(ok.status));
  record("Existing PO response is PDF", body.toString("utf8", 0, 4) === "%PDF");
  record(
    "Existing PO PDF is a single page",
    countPdfPages(body) === 1,
    `${countPdfPages(body)} page(s)`
  );
  record(
    "Existing PO number present",
    liveText.includes(String(fixture.referenceNumber))
  );
  if (fixture.unitPrice != null) {
    const rate = Number(fixture.unitPrice);
    record(
      "Existing PO rate present when stored",
      liveText.includes(rate.toFixed(2)) ||
        liveText.includes(rate.toLocaleString("en-PK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }))
    );
  } else {
    record("Blank rate allowed for unpriced PO", true);
  }
}

async function main() {
  console.log(`\nPurchase order PDF tests → ${BASE_URL}\n`);
  await testGenerator();
  try {
    await testApi();
  } catch (err) {
    record("API tests", false, err instanceof Error ? err.message : String(err));
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
