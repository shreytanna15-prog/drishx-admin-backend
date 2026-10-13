/**
 * Purchase Order PDF renderer (pure; no I/O). Uses the dependency-free
 * writer in `./pdf/simple-pdf` (standard Helvetica fonts, WinAnsi charset).
 */

import {
  A4_HEIGHT,
  A4_WIDTH,
  PdfDocument,
  type PdfPage,
  measureText,
  truncateText,
  wrapText,
} from "./pdf/simple-pdf";
import type {
  PurchaseOrderDocument,
  PurchaseOrderDocumentLine,
  PurchaseOrderDocumentParty,
} from "./purchase-order-document";

// ---------------------------------------------------------------------------
// Formatting helpers (locale/ICU independent)
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO string -> "13 Oct 2026" (UTC calendar date). Invalid input is returned as-is. */
export function formatPoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Indian digit grouping: 1234567 -> "12,34,567". */
function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  let rest = intDigits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

/** 123456.5 -> "1,23,456.50" (2 decimals, Indian grouping). */
export function formatIndianNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "-";
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const body = groupIndian(intPart!) + (frac ? `.${frac}` : "");
  return negative && Number(fixed) !== 0 ? `-${body}` : body;
}

/** 123456.5 -> "Rs. 1,23,456.50". */
export function formatInr(value: number): string {
  return `Rs. ${formatIndianNumber(value, 2)}`;
}

function formatQty(value: number): string {
  return formatIndianNumber(value, Number.isInteger(value) ? 0 : 2);
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN = 40;
const CONTENT_W = A4_WIDTH - MARGIN * 2;
const RIGHT = A4_WIDTH - MARGIN;
const FOOTER_TOP = A4_HEIGHT - 42; // content must end above this
const COLOR_TEXT = "#1f2937";
const COLOR_MUTED = "#6b7280";
const COLOR_RULE = "#d1d5db";
const COLOR_HEAD_BG = "#eef2f7";
const COLOR_ZEBRA = "#f8fafc";
const COLOR_ACCENT = "#0f3d6e";
const COLOR_WARN = "#9a3412";

type Column = {
  key: string;
  title: string;
  width: number;
  align: "left" | "right";
  wrap?: boolean;
};

const COLUMNS: Column[] = [
  { key: "no", title: "#", width: 20, align: "right" },
  { key: "product", title: "Product", width: 128, align: "left", wrap: true },
  { key: "range", title: "Range", width: 62, align: "left", wrap: true },
  { key: "power", title: "Power", width: 104, align: "left", wrap: true },
  { key: "required", title: "Required", width: 44, align: "right" },
  { key: "poQty", title: "PO Qty", width: 40, align: "right" },
  { key: "rate", title: "Rate (Rs.)", width: 52, align: "right" },
  { key: "amount", title: "Amount (Rs.)", width: CONTENT_W - 450, align: "right" },
];

const TABLE_FONT = 8;
const TABLE_LINE_H = 10;
const CELL_PAD = 3;
const MAX_CELL_LINES = 3;
const HEADER_ROW_H = 18;

function partyLines(p: PurchaseOrderDocumentParty, opts: { includeName: boolean }): string[] {
  const out: string[] = [];
  if (opts.includeName && p.name) out.push(p.name);
  if (p.tradeName && p.tradeName !== p.name) out.push(`Trade name: ${p.tradeName}`);
  if (p.contactPerson) out.push(`Attn: ${p.contactPerson}`);
  for (const l of p.addressLines) if (l && l.trim()) out.push(l.trim());
  if (p.gstin) out.push(`GSTIN: ${p.gstin}`);
  if (p.pan) out.push(`PAN: ${p.pan}`);
  if (p.phone) out.push(`Phone: ${p.phone}`);
  if (p.email) out.push(`Email: ${p.email}`);
  return out;
}

function lineCells(line: PurchaseOrderDocumentLine): Record<string, string> {
  return {
    no: String(line.lineNumber),
    product: line.productLabel ?? "-",
    range: line.rangeLabel ?? "-",
    power: line.powerLabel ?? "-",
    required: formatQty(line.requiredQuantity),
    poQty: formatQty(line.poQuantity),
    rate: line.rate == null ? "-" : formatIndianNumber(line.rate),
    amount: line.rate == null ? "-" : formatIndianNumber(line.amount),
  };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderPurchaseOrderPdf(doc: PurchaseOrderDocument): Buffer {
  const pdf = new PdfDocument({
    title: `Purchase Order ${doc.publicId}`,
    author: doc.buyer.name,
    subject: `Purchase Order for ${doc.supplier.name}`,
  });

  let page = pdf.addPage();
  let y = MARGIN;

  const newPage = (continued: boolean): void => {
    page = pdf.addPage();
    y = MARGIN;
    if (continued) {
      page.text(MARGIN, y + 10, `Purchase Order ${doc.publicId} (continued)`, {
        size: 9,
        bold: true,
        color: COLOR_MUTED,
      });
      y += 22;
    }
  };

  const ensureSpace = (h: number): void => {
    if (y + h > FOOTER_TOP) newPage(true);
  };

  // ---- Header ------------------------------------------------------------
  const leftW = 290;
  let leftY = y + 16;
  for (const [i, l] of wrapText(doc.buyer.name || "DrishX", leftW, 16, true).entries()) {
    if (i >= 2) break;
    page.text(MARGIN, leftY, l, { size: 16, bold: true, color: COLOR_ACCENT });
    leftY += 19;
  }
  leftY += 1;
  for (const l of partyLines(doc.buyer, { includeName: false })) {
    for (const wl of wrapText(l, leftW, 8.5)) {
      page.text(MARGIN, leftY, wl, { size: 8.5, color: COLOR_TEXT });
      leftY += 11;
    }
  }

  let rightY = y + 16;
  page.text(RIGHT, rightY, "PURCHASE ORDER", { size: 18, bold: true, color: COLOR_ACCENT, align: "right" });
  rightY += 20;
  const meta: [string, string][] = [
    ["PO number", doc.publicId],
    ["Status", doc.statusLabel || doc.status],
    ["Created", formatPoDate(doc.createdAt)],
  ];
  if (doc.approvedAt) meta.push(["Approved", formatPoDate(doc.approvedAt)]);
  if (doc.sentAt) meta.push(["Sent", formatPoDate(doc.sentAt)]);
  meta.push(["Expected delivery", doc.expectedDelivery ? formatPoDate(doc.expectedDelivery) : "Not specified"]);
  meta.push(["Warehouse", doc.warehouseCode]);
  const labelX = RIGHT - 200;
  for (const [label, value] of meta) {
    page.text(labelX, rightY, label, { size: 8.5, color: COLOR_MUTED });
    page.text(RIGHT, rightY, value, {
      size: 8.5,
      bold: label === "PO number",
      color: COLOR_TEXT,
      align: "right",
      maxWidth: 120,
    });
    rightY += 12;
  }

  y = Math.max(leftY, rightY) + 4;
  page.line(MARGIN, y, RIGHT, y, { width: 1, color: COLOR_ACCENT });
  y += 12;

  // ---- Supplier / Deliver-to boxes --------------------------------------
  const gap = 12;
  const boxW = (CONTENT_W - gap) / 2;
  const innerW = boxW - 16;
  const supplierLines = [
    ...wrapText(doc.supplier.name || "-", innerW, 9.5, true).map((t) => ({ t, bold: true })),
    ...partyLines(doc.supplier, { includeName: false }).flatMap((l) =>
      wrapText(l, innerW, 8.5).map((t) => ({ t, bold: false }))
    ),
  ];
  const deliverLines = [
    ...wrapText(doc.buyer.name || "-", innerW, 9.5, true).map((t) => ({ t, bold: true })),
    ...wrapText(`Warehouse: ${doc.warehouseCode}`, innerW, 8.5).map((t) => ({ t, bold: false })),
    ...doc.buyer.addressLines
      .filter((l) => l && l.trim())
      .flatMap((l) => wrapText(l.trim(), innerW, 8.5).map((t) => ({ t, bold: false }))),
  ];
  const boxTitleH = 16;
  const boxBodyH = Math.max(supplierLines.length, deliverLines.length) * 11.5 + 10;
  const boxH = boxTitleH + boxBodyH;
  const drawBox = (x: number, title: string, rows: { t: string; bold: boolean }[]) => {
    page.rect(x, y, boxW, boxTitleH, { fill: COLOR_HEAD_BG });
    page.rect(x, y, boxW, boxH, { stroke: COLOR_RULE, lineWidth: 0.75 });
    page.text(x + 8, y + 11, title.toUpperCase(), { size: 8, bold: true, color: COLOR_ACCENT });
    let by = y + boxTitleH + 13;
    for (const r of rows) {
      page.text(x + 8, by, r.t, { size: r.bold ? 9.5 : 8.5, bold: r.bold, color: COLOR_TEXT });
      by += 11.5;
    }
  };
  drawBox(MARGIN, "Supplier", supplierLines);
  drawBox(MARGIN + boxW + gap, "Deliver to", deliverLines);
  y += boxH + 18;

  // ---- Lines table -------------------------------------------------------
  const drawTableHeader = (): void => {
    page.rect(MARGIN, y, CONTENT_W, HEADER_ROW_H, { fill: COLOR_ACCENT });
    let x = MARGIN;
    for (const c of COLUMNS) {
      const tx = c.align === "right" ? x + c.width - CELL_PAD : x + CELL_PAD;
      page.text(tx, y + 12, c.title, {
        size: TABLE_FONT,
        bold: true,
        color: "#ffffff",
        align: c.align,
        maxWidth: c.width - CELL_PAD * 2,
      });
      x += c.width;
    }
    y += HEADER_ROW_H;
  };

  ensureSpace(HEADER_ROW_H + 20);
  drawTableHeader();

  if (doc.lines.length === 0) {
    page.text(MARGIN + CELL_PAD, y + 13, "No lines on this purchase order.", {
      size: TABLE_FONT,
      color: COLOR_MUTED,
    });
    y += 20;
  }

  doc.lines.forEach((line, idx) => {
    const cells = lineCells(line);
    const cellLines: Record<string, string[]> = {};
    let maxLines = 1;
    for (const c of COLUMNS) {
      const avail = c.width - CELL_PAD * 2;
      const raw = cells[c.key] ?? "";
      let ls: string[];
      if (c.wrap) {
        ls = wrapText(raw, avail, TABLE_FONT);
        if (ls.length > MAX_CELL_LINES) {
          ls = ls.slice(0, MAX_CELL_LINES);
          ls[MAX_CELL_LINES - 1] = truncateText(`${ls[MAX_CELL_LINES - 1]}...`, avail, TABLE_FONT);
        }
        if (ls.length === 0) ls = [""];
      } else {
        ls = [truncateText(raw, avail, TABLE_FONT)];
      }
      cellLines[c.key] = ls;
      maxLines = Math.max(maxLines, ls.length);
    }
    const rowH = maxLines * TABLE_LINE_H + 6;

    if (y + rowH > FOOTER_TOP) {
      newPage(true);
      drawTableHeader();
    }
    if (idx % 2 === 1) page.rect(MARGIN, y, CONTENT_W, rowH, { fill: COLOR_ZEBRA });
    let x = MARGIN;
    for (const c of COLUMNS) {
      const tx = c.align === "right" ? x + c.width - CELL_PAD : x + CELL_PAD;
      cellLines[c.key]!.forEach((t, i) => {
        page.text(tx, y + 10 + i * TABLE_LINE_H, t, { size: TABLE_FONT, color: COLOR_TEXT, align: c.align });
      });
      x += c.width;
    }
    y += rowH;
    page.line(MARGIN, y, RIGHT, y, { width: 0.4, color: COLOR_RULE });
  });

  // ---- Totals ------------------------------------------------------------
  const totalsRows: [string, string, boolean][] = [
    ["Total lines", formatQty(doc.totals.lineCount), false],
    ["Total quantity", formatQty(doc.totals.totalQuantity), false],
    ["Subtotal", formatInr(doc.totals.subtotal), false],
    ["Total", formatInr(doc.totals.totalAmount), true],
  ];
  const unpricedNote = "Rate not specified for some lines — amounts exclude unpriced lines.";
  const noteLines = doc.totals.hasUnpricedLines ? wrapText(unpricedNote, CONTENT_W, 8.5, true) : [];
  ensureSpace(14 + totalsRows.length * 14 + 8 + noteLines.length * 11 + 6);
  y += 14;
  const totalsLabelX = RIGHT - 220;
  for (const [label, value, strong] of totalsRows) {
    if (strong) {
      page.rect(totalsLabelX - 6, y - 3, RIGHT - totalsLabelX + 6, 16, { fill: COLOR_HEAD_BG });
    }
    page.text(totalsLabelX, y + 9, label, { size: strong ? 10 : 9, bold: strong, color: strong ? COLOR_ACCENT : COLOR_MUTED });
    page.text(RIGHT - 4, y + 9, value, { size: strong ? 10 : 9, bold: strong, color: COLOR_TEXT, align: "right" });
    y += 14;
  }
  y += 8;
  for (const l of noteLines) {
    page.text(MARGIN, y + 8, l, { size: 8.5, bold: true, color: COLOR_WARN });
    y += 11;
  }

  // ---- Notes -------------------------------------------------------------
  const notes = doc.notes?.trim();
  if (notes) {
    y += 10;
    ensureSpace(30);
    page.text(MARGIN, y + 9, "Notes", { size: 10, bold: true, color: COLOR_ACCENT });
    y += 16;
    for (const l of wrapText(notes, CONTENT_W, 9)) {
      ensureSpace(12);
      page.text(MARGIN, y + 9, l, { size: 9, color: COLOR_TEXT });
      y += 12;
    }
  }

  // ---- Footer on every page ----------------------------------------------
  const pages = pdf.getPages();
  const total = pages.length;
  pages.forEach((p: PdfPage, i) => {
    const fy = A4_HEIGHT - 30;
    p.line(MARGIN, fy - 10, RIGHT, fy - 10, { width: 0.5, color: COLOR_RULE });
    const left = `Generated by DrishX · ${doc.publicId}`;
    p.text(MARGIN, fy, left, { size: 7.5, color: COLOR_MUTED, maxWidth: CONTENT_W - measureText("Page 999 of 999", 7.5) - 20 });
    p.text(RIGHT, fy, `Page ${i + 1} of ${total}`, { size: 7.5, color: COLOR_MUTED, align: "right" });
  });

  return pdf.toBuffer();
}
