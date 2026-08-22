import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { ADMIN_APPROVER_ROLES } from "./adminRoles";

export type PurchaseOrderPdfApproval = {
  role?: string | null;
  name?: string | null;
  status?: string | null;
};

export type PurchaseOrderPdfData = {
  referenceNumber: string;
  createdAt: Date | string;
  projectName: string;
  vendorName: string;
  sectionName: string;
  deliverTo: string;
  itemName: string;
  unit: string;
  unitPrice?: number | string | null;
  quantity: number | string;
  createdByName?: string | null;
  approvals?: PurchaseOrderPdfApproval[];
};

// A4 in points
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// Palette sampled from the provided invoice template
const COLOR_BLACK = "#000000";
const COLOR_ORANGE = "#ED8F36";
const COLOR_LABEL = "#545353";
const COLOR_VALUE = "#1A1A1A";
const COLOR_ROLE = "#B4B4B4";
const COLOR_LINE = "#111111";

const findLogoPath = (): string | null => {
  const candidates = [
    path.join(__dirname, "../assets/po-header-logo.png"),
    path.join(process.cwd(), "src/assets/po-header-logo.png"),
    path.join(process.cwd(), "dist/src/assets/po-header-logo.png"),
  ];
  return candidates.find((filePath) => fs.existsSync(filePath)) || null;
};

const formatDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
};

const formatRate = (value?: number | string | null) => {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return amount.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatQty = (value: number | string) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value ?? "");
  return amount.toLocaleString("en-PK", { maximumFractionDigits: 3 });
};

const pickApprover = (
  approvals: PurchaseOrderPdfApproval[] | undefined,
  roles: string[]
) => {
  const normalizedRoles = roles.map((role) => String(role).toUpperCase());
  const match = (approvals || []).find((approval) => {
    const role = approval.role ? String(approval.role).toUpperCase() : "";
    const status = approval.status
      ? String(approval.status).toUpperCase()
      : "";
    return status === "APPROVED" && role && normalizedRoles.includes(role);
  });
  return match?.name || "";
};

const pickAdminApprover = (approvals: PurchaseOrderPdfApproval[] | undefined) =>
  pickApprover(approvals, [...ADMIN_APPROVER_ROLES]);

type Pt = [number, number];

// Draw a smooth curve through the given points using Catmull-Rom splines
// converted to cubic beziers. The current point must already be at pts[0].
const catmullRom = (doc: PDFKit.PDFDocument, pts: Pt[]) => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    doc.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
};

const drawHeader = (doc: PDFKit.PDFDocument) => {
  // Orange wave sits behind and peeks out on the lower-right.
  const orangeBottom: Pt[] = [
    [0, 55],
    [150, 70],
    [250, 95],
    [320, 120],
    [380, 150],
    [440, 175],
    [500, 190],
    [545, 194],
    [PAGE_WIDTH, 186],
  ];
  doc.save();
  doc.moveTo(0, 0);
  doc.lineTo(PAGE_WIDTH, 0);
  doc.lineTo(PAGE_WIDTH, 186);
  const orangeReversed = [...orangeBottom].reverse();
  doc.moveTo(PAGE_WIDTH, 186);
  // rebuild path continuity: line to first reversed point then smooth
  doc.lineTo(orangeReversed[0][0], orangeReversed[0][1]);
  catmullRom(doc, orangeReversed);
  doc.lineTo(0, 0);
  doc.fillColor(COLOR_ORANGE).fill();
  doc.restore();

  // Black wave drawn on top; its wavy bottom is the visible header edge.
  const blackBottom: Pt[] = [
    [0, 168],
    [80, 150],
    [150, 158],
    [205, 176],
    [260, 171],
    [300, 152],
    [340, 120],
    [400, 92],
    [460, 70],
    [520, 62],
    [PAGE_WIDTH, 57],
  ];
  doc.save();
  doc.moveTo(0, 0);
  doc.lineTo(0, blackBottom[0][1]);
  catmullRom(doc, blackBottom);
  doc.lineTo(PAGE_WIDTH, 0);
  doc.fillColor(COLOR_BLACK).fill();
  doc.restore();

  // Dual logo at natural aspect ratio (source is 238x58) so it stays crisp.
  const logoPath = findLogoPath();
  const logoHeight = 44;
  const logoWidth = (238 / 58) * logoHeight;
  if (logoPath) {
    try {
      doc.image(logoPath, 32, 30, { width: logoWidth, height: logoHeight });
      return;
    } catch {
      /* fall through to text */
    }
  }
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("RUSTUM ASSOCIATES   |   DYNAMIC CONSTRUCTORS", 32, 44, {
      width: PAGE_WIDTH - 64,
    });
};

const drawMetaRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string
) => {
  const leftX = 33;
  const rightX = 307;
  const colWidth = 235;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_LABEL)
    .text(leftLabel, leftX, y, { width: colWidth })
    .text(rightLabel, rightX, y, { width: colWidth });
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(COLOR_VALUE)
    .text(leftValue || "", leftX, y + 15, {
      width: colWidth,
      ellipsis: true,
    })
    .text(rightValue || "", rightX, y + 15, {
      width: colWidth,
      ellipsis: true,
    });
};

const drawItemsTable = (doc: PDFKit.PDFDocument, data: PurchaseOrderPdfData) => {
  const dividers = [33, 62, 251, 309, 422, 547];
  const left = dividers[0];
  const right = dividers[dividers.length - 1];
  const tableWidth = right - left;
  const headerTop = 330;
  const headerHeight = 37;
  const rowHeight = 42;
  const rowCount = 4;

  const columns = [
    { header: "#", align: "center" as const },
    { header: "Item Name", align: "center" as const },
    { header: "Unit", align: "center" as const },
    { header: "Per Unit Rate", align: "center" as const },
    { header: "Item Qty", align: "center" as const },
  ];

  // Header band
  doc.rect(left, headerTop, tableWidth, headerHeight).fill(COLOR_BLACK);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF");
  columns.forEach((col, i) => {
    const x = dividers[i];
    const w = dividers[i + 1] - dividers[i];
    doc.text(col.header, x, headerTop + headerHeight / 2 - 5, {
      width: w,
      align: "center",
    });
  });

  // Body rows
  const bodyTop = headerTop + headerHeight;
  const rowValues: string[][] = [
    [
      "1",
      data.itemName || "",
      data.unit || "",
      formatRate(data.unitPrice),
      formatQty(data.quantity),
    ],
  ];
  for (let r = 2; r <= rowCount; r += 1) {
    rowValues.push([String(r), "", "", "", ""]);
  }

  doc.lineWidth(1).strokeColor(COLOR_LINE);
  for (let r = 0; r < rowCount; r += 1) {
    const rowTop = bodyTop + r * rowHeight;
    // cell borders
    for (let c = 0; c < columns.length; c += 1) {
      const x = dividers[c];
      const w = dividers[c + 1] - dividers[c];
      doc.rect(x, rowTop, w, rowHeight).stroke();
    }
    // cell text
    const values = rowValues[r];
    const aligns: Array<"center" | "left" | "right"> = [
      "center",
      "left",
      "center",
      "right",
      "right",
    ];
    for (let c = 0; c < columns.length; c += 1) {
      const x = dividers[c];
      const w = dividers[c + 1] - dividers[c];
      const padX = c === 1 ? 8 : 6;
      doc
        .font("Helvetica")
        .fontSize(c === 0 ? 10 : 9.5)
        .fillColor(COLOR_VALUE)
        .text(values[c] || "", x + padX, rowTop + rowHeight / 2 - 6, {
          width: w - padX * 2,
          align: aligns[c],
          ellipsis: true,
        });
    }
  }

  return bodyTop + rowCount * rowHeight;
};

const drawSignatureLine = (
  doc: PDFKit.PDFDocument,
  labelY: number,
  roleY: number,
  label: string,
  role: string,
  name: string
) => {
  const labelX = 33;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_VALUE)
    .text(label, labelX, labelY, { width: 120 });
  if (name) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_VALUE)
      .text(name, labelX + 96, labelY, { width: 180, ellipsis: true });
  }
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR_ROLE)
    .text(role, labelX + 24, roleY, { width: 200 });
};

export const generatePurchaseOrderPdf = (
  data: PurchaseOrderPdfData
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: 0,
      compress: false,
      bufferPages: true,
      info: {
        Title: data.referenceNumber,
        Author: "RADC Construction",
        Subject: "Purchase Order",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc);

    // Meta rows (order matches the template)
    drawMetaRow(
      doc,
      188,
      "PO Number",
      data.referenceNumber,
      "Creation Date",
      formatDate(data.createdAt)
    );
    drawMetaRow(
      doc,
      231,
      "Project",
      data.projectName,
      "Section",
      data.sectionName
    );
    drawMetaRow(
      doc,
      273,
      "Vendor Name",
      data.vendorName,
      "Deliver To",
      data.deliverTo
    );

    drawItemsTable(doc, data);

    // Signatures
    const createdBy = data.createdByName || "";
    const pm = pickApprover(data.approvals, ["PROJECT_MANAGER"]);
    const si = pickApprover(data.approvals, ["SITE_INCHARGE"]);
    const admin = pickAdminApprover(data.approvals);

    drawSignatureLine(
      doc,
      560,
      578,
      "Created By:",
      "(Construction Manager)",
      createdBy
    );
    drawSignatureLine(
      doc,
      604,
      622,
      "Approved By:",
      "(Project Manager)",
      pm
    );
    drawSignatureLine(doc, 646, 664, "Approved By:", "(Site In-charge)", si);
    drawSignatureLine(doc, 688, 706, "Approved By:", "(Admin)", admin);

    // Received By (bottom-right, blank for wet signature)
    const rbLeft = 378;
    const rbRight = 560;
    doc
      .moveTo(rbLeft, 690)
      .lineTo(rbRight, 690)
      .lineWidth(1)
      .strokeColor(COLOR_LINE)
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_VALUE)
      .text("Received By", rbLeft, 697, {
        width: rbRight - rbLeft,
        align: "center",
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_ROLE)
      .text("Signature & Date", rbLeft, 713, {
        width: rbRight - rbLeft,
        align: "center",
      });

    // Footer
    doc
      .moveTo(31, 768)
      .lineTo(560, 768)
      .lineWidth(2)
      .strokeColor(COLOR_ORANGE)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#333333")
      .text(
        "System-generated purchase order \u2014 Created and Approved fields are auto-filled by the software.",
        60,
        778,
        { width: PAGE_WIDTH - 120, align: "center", lineGap: 2 }
      );

    // Only ever emit a single page.
    const range = doc.bufferedPageRange();
    for (let i = range.count - 1; i > 0; i -= 1) {
      // Should not happen, but guard against accidental extra pages.
      doc.switchToPage(i);
    }

    doc.end();
  });
