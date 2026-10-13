import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import type {
  PurchaseOrderDocument,
  PurchaseOrderDocumentLine,
} from "./purchase-order-document";
import {
  PO_XLSX_LINE_HEADERS,
  PO_XLSX_SHEET_NAME,
  buildPurchaseOrderWorkbookBuffer,
} from "./purchase-order-xlsx";

function line(n: number, rate: number | null): PurchaseOrderDocumentLine {
  const poQuantity = 10 * n;
  return {
    lineNumber: n,
    lensType: "SINGLE_VISION",
    productLabel: `SV Blue ${n}`,
    rangeLabel: "1.56",
    powerLabel: n === 1 ? "SPH -2.25 / CYL -0.75" : "+4.25",
    requiredQuantity: poQuantity + 1,
    poQuantity,
    receivedQuantity: n,
    cancelledQuantity: 0,
    outstandingQuantity: poQuantity - n,
    rate,
    amount: rate == null ? 0 : rate * poQuantity,
  };
}

function fixture(): PurchaseOrderDocument {
  const lines = [line(1, 100.5), line(2, null), line(3, 20)];
  return {
    publicId: "PO-2026-000007",
    status: "SENT",
    statusLabel: "Sent to supplier",
    createdAt: "2026-10-13T05:30:00.000Z",
    approvedAt: "2026-10-13T06:00:00.000Z",
    sentAt: "2026-10-13T07:00:00.000Z",
    expectedDelivery: null,
    warehouseCode: "WH-01",
    notes: "Handle with care.",
    buyer: { name: "DrishX", addressLines: ["Delhi"], gstin: "07AAAAA0000A1Z5" },
    supplier: {
      name: "Acme Optics",
      tradeName: "Acme",
      contactPerson: "R. Sharma",
      gstin: "27BBBBB1111B1Z9",
      pan: "BBBBB1111B",
      addressLines: ["Unit 4", "Mumbai"],
      phone: "022",
      email: "a@b.example",
    },
    lines,
    totals: {
      lineCount: 3,
      totalQuantity: 60,
      subtotal: 1005 + 600,
      totalAmount: 1005 + 600,
      hasUnpricedLines: true,
    },
  };
}

async function load(buf: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet(PO_XLSX_SHEET_NAME);
  assert.ok(ws);
  return ws;
}

function findRow(ws: ExcelJS.Worksheet, col: number, value: unknown): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (ws.getRow(r).getCell(col).value === value) return r;
  }
  return -1;
}

function numeric(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && "result" in v) return v.result;
  return v;
}

describe("buildPurchaseOrderWorkbookBuffer", () => {
  it("round-trips through exceljs with header, parties, lines and totals", async () => {
    const ws = await load(await buildPurchaseOrderWorkbookBuffer(fixture()));

    const poRow = findRow(ws, 1, "PO number");
    assert.equal(ws.getRow(poRow).getCell(2).value, "PO-2026-000007");
    assert.equal(ws.getRow(findRow(ws, 1, "Status")).getCell(2).value, "Sent to supplier");
    assert.equal(ws.getRow(findRow(ws, 1, "Sent")).getCell(2).value, "13 Oct 2026");

    const supplierHead = findRow(ws, 1, "Supplier");
    assert.ok(supplierHead > 0);
    const gstinRows: number[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getRow(r).getCell(1).value === "GSTIN") gstinRows.push(r);
    }
    const supplierGstin = gstinRows.find((r) => r > supplierHead)!;
    assert.equal(ws.getRow(supplierGstin).getCell(2).value, "27BBBBB1111B1Z9");
    assert.equal(ws.getRow(findRow(ws, 1, "PAN")).getCell(2).value, "BBBBB1111B");

    const headerRow = findRow(ws, 1, "#");
    assert.deepEqual(
      (ws.getRow(headerRow).values as unknown[]).slice(1),
      [...PO_XLSX_LINE_HEADERS]
    );
    assert.equal(ws.views[0]?.state, "frozen");
    assert.equal((ws.views[0] as { ySplit?: number }).ySplit, headerRow);

    const data = [1, 2, 3].map((i) => ws.getRow(headerRow + i));
    assert.deepEqual(data.map((r) => r.getCell(1).value), [1, 2, 3]);
    assert.equal(data[0]!.getCell(4).value, "SPH -2.25 / CYL -0.75");
    assert.deepEqual(data.map((r) => r.getCell(7).value), [10, 20, 30]);
    assert.deepEqual(data.map((r) => r.getCell(8).value), [1, 2, 3]);
    assert.deepEqual(data.map((r) => r.getCell(10).value), [9, 18, 27]);
    assert.equal(data[0]!.getCell(11).value, 100.5);
    assert.equal(data[0]!.getCell(11).numFmt, "#,##0.00");
    assert.equal(data[0]!.getCell(7).numFmt, "#,##0");
    // Unpriced line: rate and amount cells empty.
    assert.equal(data[1]!.getCell(11).value, null);
    assert.equal(data[1]!.getCell(12).value, null);

    const totals = ws.getRow(headerRow + 4);
    assert.equal(totals.getCell(2).value, "Total (3 lines)");
    const poQtyTotal = totals.getCell(7).value as ExcelJS.CellFormulaValue;
    assert.equal(poQtyTotal.formula, `SUM(G${headerRow + 1}:G${headerRow + 3})`);
    assert.equal(numeric(poQtyTotal), 60);
    assert.equal(numeric(totals.getCell(6).value), 63);
    assert.equal(numeric(totals.getCell(10).value), 54);
    assert.equal(numeric(totals.getCell(12).value), 1605);

    assert.equal(ws.getRow(findRow(ws, 11, "Total amount")).getCell(12).value, 1605);
    assert.ok(findRow(ws, 1, "Rate not specified for some lines - amounts exclude unpriced lines.") > 0);
    const notesHead = findRow(ws, 1, "Notes");
    assert.equal(ws.getRow(notesHead + 1).getCell(1).value, "Handle with care.");
  });

  it("handles a PO with no lines", async () => {
    const doc = fixture();
    doc.lines = [];
    doc.notes = null;
    doc.totals = { lineCount: 0, totalQuantity: 0, subtotal: 0, totalAmount: 0, hasUnpricedLines: false };
    const ws = await load(await buildPurchaseOrderWorkbookBuffer(doc));
    const headerRow = findRow(ws, 1, "#");
    assert.equal(ws.getRow(headerRow + 1).getCell(2).value, "Total (0 lines)");
    assert.equal(ws.getRow(headerRow + 1).getCell(7).value, 0);
    assert.equal(findRow(ws, 1, "Notes"), -1);
  });
});
