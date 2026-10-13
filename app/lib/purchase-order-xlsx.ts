/**
 * Purchase Order Excel workbook (exceljs). Pure: returns a Buffer.
 */

import ExcelJS from "exceljs";
import type {
  PurchaseOrderDocument,
  PurchaseOrderDocumentParty,
} from "./purchase-order-document";

export const PO_XLSX_SHEET_NAME = "Purchase Order";

export const PO_XLSX_LINE_HEADERS = [
  "#",
  "Product",
  "Range",
  "Power",
  "Lens type",
  "Required",
  "PO Qty",
  "Received",
  "Cancelled",
  "Outstanding",
  "Rate",
  "Amount",
] as const;

const QTY_FMT = "#,##0";
const MONEY_FMT = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F3D6E" },
};
const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEF2F7" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function partyRows(p: PurchaseOrderDocumentParty): [string, string][] {
  const rows: [string, string][] = [["Name", p.name]];
  if (p.tradeName) rows.push(["Trade name", p.tradeName]);
  if (p.contactPerson) rows.push(["Contact person", p.contactPerson]);
  const address = p.addressLines.filter((l) => l && l.trim()).join(", ");
  if (address) rows.push(["Address", address]);
  if (p.gstin) rows.push(["GSTIN", p.gstin]);
  if (p.pan) rows.push(["PAN", p.pan]);
  if (p.phone) rows.push(["Phone", p.phone]);
  if (p.email) rows.push(["Email", p.email]);
  return rows;
}

export async function buildPurchaseOrderWorkbookBuffer(
  doc: PurchaseOrderDocument
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DrishX";
  wb.title = `Purchase Order ${doc.publicId}`;
  wb.created = new Date(doc.createdAt);
  if (Number.isNaN(wb.created.getTime())) wb.created = new Date(0);

  const ws = wb.addWorksheet(PO_XLSX_SHEET_NAME);
  ws.columns = [
    { width: 6 }, // #
    { width: 30 }, // Product
    { width: 16 }, // Range
    { width: 30 }, // Power
    { width: 16 }, // Lens type
    { width: 11 }, // Required
    { width: 11 }, // PO Qty
    { width: 11 }, // Received
    { width: 11 }, // Cancelled
    { width: 12 }, // Outstanding
    { width: 12 }, // Rate
    { width: 15 }, // Amount
  ];

  // ---- Title + meta -------------------------------------------------------
  const title = ws.addRow([`Purchase Order ${doc.publicId}`]);
  title.font = { bold: true, size: 14, color: { argb: "FF0F3D6E" } };
  ws.mergeCells(title.number, 1, title.number, 6);

  const meta: [string, string][] = [
    ["PO number", doc.publicId],
    ["Status", doc.statusLabel || doc.status],
    ["Created", formatDate(doc.createdAt)],
    ["Approved", formatDate(doc.approvedAt)],
    ["Sent", formatDate(doc.sentAt)],
    ["Expected delivery", formatDate(doc.expectedDelivery)],
    ["Warehouse", doc.warehouseCode],
  ];
  for (const [k, v] of meta) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  const addPartyBlock = (heading: string, p: PurchaseOrderDocumentParty) => {
    const h = ws.addRow([heading]);
    h.font = { bold: true };
    for (let c = 1; c <= PO_XLSX_LINE_HEADERS.length; c++) h.getCell(c).fill = SECTION_FILL;
    for (const [k, v] of partyRows(p)) {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    }
    ws.addRow([]);
  };
  addPartyBlock("Buyer", doc.buyer);
  addPartyBlock("Supplier", doc.supplier);

  // ---- Lines table --------------------------------------------------------
  const header = ws.addRow([...PO_XLSX_LINE_HEADERS]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
  const headerRowNumber = header.number;
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowNumber }];

  const firstDataRow = headerRowNumber + 1;
  for (const line of doc.lines) {
    const r = ws.addRow([
      line.lineNumber,
      line.productLabel ?? "",
      line.rangeLabel ?? "",
      line.powerLabel ?? "",
      line.lensType,
      line.requiredQuantity,
      line.poQuantity,
      line.receivedQuantity,
      line.cancelledQuantity,
      line.outstandingQuantity,
      line.rate ?? null,
      line.rate == null ? null : line.amount,
    ]);
    for (let c = 6; c <= 10; c++) r.getCell(c).numFmt = QTY_FMT;
    r.getCell(11).numFmt = MONEY_FMT;
    r.getCell(12).numFmt = MONEY_FMT;
  }
  const lastDataRow = firstDataRow + doc.lines.length - 1;

  // ---- Totals -------------------------------------------------------------
  const sum = (col: string, result: number): ExcelJS.CellFormulaValue | number =>
    doc.lines.length > 0
      ? { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`, result }
      : result;
  const totalsOf = (pick: (l: PurchaseOrderDocument["lines"][number]) => number) =>
    doc.lines.reduce((s, l) => s + pick(l), 0);

  const totals = ws.addRow([
    "",
    `Total (${doc.totals.lineCount} lines)`,
    "",
    "",
    "",
    sum("F", totalsOf((l) => l.requiredQuantity)),
    sum("G", doc.totals.totalQuantity),
    sum("H", totalsOf((l) => l.receivedQuantity)),
    sum("I", totalsOf((l) => l.cancelledQuantity)),
    sum("J", totalsOf((l) => l.outstandingQuantity)),
    null,
    sum("L", doc.totals.totalAmount),
  ]);
  totals.font = { bold: true };
  totals.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: "thin" } };
    cell.fill = SECTION_FILL;
  });
  for (let c = 6; c <= 10; c++) totals.getCell(c).numFmt = QTY_FMT;
  totals.getCell(12).numFmt = MONEY_FMT;

  const summary: [string, number][] = [
    ["Subtotal", doc.totals.subtotal],
    ["Total amount", doc.totals.totalAmount],
  ];
  for (const [k, v] of summary) {
    const r = ws.addRow([]);
    r.getCell(11).value = k;
    r.getCell(11).font = { bold: true };
    r.getCell(12).value = v;
    r.getCell(12).numFmt = MONEY_FMT;
    r.getCell(12).font = { bold: true };
  }

  if (doc.totals.hasUnpricedLines) {
    const r = ws.addRow([
      "Rate not specified for some lines - amounts exclude unpriced lines.",
    ]);
    r.font = { italic: true, color: { argb: "FF9A3412" } };
  }

  const notes = doc.notes?.trim();
  if (notes) {
    ws.addRow([]);
    const h = ws.addRow(["Notes"]);
    h.font = { bold: true };
    const r = ws.addRow([notes]);
    ws.mergeCells(r.number, 1, r.number, PO_XLSX_LINE_HEADERS.length);
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = Math.min(409, 15 * Math.max(1, Math.ceil(notes.length / 120) + (notes.match(/\n/g)?.length ?? 0)));
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
