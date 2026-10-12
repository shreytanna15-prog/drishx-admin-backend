import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPORT_EXPORT_ROW_LIMIT,
  buildReportExport,
  escapeCsvField,
  exportSheetsToCsv,
  formatExportNumber,
  isReportPayloadTruncated,
  parseExportFormat,
  sanitizeSpreadsheetCell,
} from "./export-format";
import { exportSheetsToXlsxBuffer } from "./export-workbook";
import type { ReportSuccessResponse } from "./types";

function sampleTableResponse(
  overrides?: Partial<ReportSuccessResponse>
): ReportSuccessResponse {
  return {
    report: "pending-orders",
    title: "Pending Orders",
    category: "orders",
    params: { fy: null, from: "2026-01-01", to: "2026-01-31" },
    data: {
      kind: "table",
      columns: [
        { key: "orderNumber", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "totalAmount", label: "Amount", align: "right" },
        { key: "createdAt", label: "Placed" },
      ],
      rows: [
        {
          orderNumber: "#1001",
          customer: "Acme Optics",
          totalAmount: 1250.5,
          createdAt: "2026-01-15T10:00:00.000Z",
        },
        {
          orderNumber: "#1002",
          customer: "=CMD()",
          totalAmount: 99,
          createdAt: "2026-01-16T11:00:00.000Z",
        },
      ],
      summary: {
        matchingCount: 2,
        returnedCount: 2,
        amountInReturnedRows: 1349.5,
      },
      meta: { truncated: false, rowLimit: 500 },
    },
    ...overrides,
  };
}

describe("parseExportFormat", () => {
  it("accepts csv and xlsx", () => {
    assert.equal(parseExportFormat("csv"), "csv");
    assert.equal(parseExportFormat("XLSX"), "xlsx");
    assert.equal(parseExportFormat(null), null);
    assert.equal(parseExportFormat("pdf"), null);
  });
});

describe("sanitizeSpreadsheetCell", () => {
  it("prefixes formula-like strings", () => {
    assert.equal(sanitizeSpreadsheetCell("=1+1"), "'=1+1");
    assert.equal(sanitizeSpreadsheetCell("+123"), "'+123");
    assert.equal(sanitizeSpreadsheetCell("-paid"), "'-paid");
    assert.equal(sanitizeSpreadsheetCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(sanitizeSpreadsheetCell("\tTAB"), "'\tTAB");
  });

  it("leaves safe strings and numbers unchanged", () => {
    assert.equal(sanitizeSpreadsheetCell("Acme"), "Acme");
    assert.equal(sanitizeSpreadsheetCell(42.5), 42.5);
    assert.equal(sanitizeSpreadsheetCell(0), 0);
    assert.equal(sanitizeSpreadsheetCell(null), null);
  });
});

describe("escapeCsvField / formatExportNumber", () => {
  it("escapes commas and quotes", () => {
    assert.equal(escapeCsvField('a,b'), '"a,b"');
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  });

  it("formats numbers without locale grouping", () => {
    assert.equal(formatExportNumber(1000), "1000");
    assert.equal(formatExportNumber(1250.5), "1250.5");
  });
});

describe("isReportPayloadTruncated", () => {
  it("detects truncated meta", () => {
    assert.equal(
      isReportPayloadTruncated({
        kind: "table",
        columns: [],
        rows: [],
        meta: { truncated: true },
      }),
      true
    );
    assert.equal(
      isReportPayloadTruncated({
        kind: "table",
        columns: [],
        rows: [],
        meta: { truncated: false },
      }),
      false
    );
  });
});

describe("buildReportExport + CSV", () => {
  it("uses human-readable headers and preserves amounts", () => {
    const built = buildReportExport(sampleTableResponse());
    const dataSheet = built.sheets.find((s) => s.name === "Data");
    assert.ok(dataSheet);
    assert.deepEqual(dataSheet!.headers, [
      "Order",
      "Customer",
      "Amount",
      "Placed",
    ]);
    assert.equal(dataSheet!.rows[0][2], 1250.5);
    assert.equal(dataSheet!.rows[1][1], "'=CMD()");

    const summary = built.sheets.find((s) => s.name === "Summary");
    assert.ok(summary);
    const amountRow = summary!.rows.find(
      (r) => r[0] === "Amount In Returned Rows"
    );
    assert.ok(amountRow);
    assert.equal(amountRow![1], 1349.5);

    const csv = exportSheetsToCsv(built.sheets);
    assert.match(csv, /^(\uFEFF)?Info/);
    assert.match(csv, /Order,Customer,Amount,Placed/);
    assert.match(csv, /1250\.5/);
    assert.match(csv, /'=CMD\(\)/);
    assert.ok(built.filenameBase.includes("pending-orders"));
  });

  it("exports empty tables with headers only", () => {
    const built = buildReportExport(
      sampleTableResponse({
        data: {
          kind: "table",
          columns: [
            { key: "orderNumber", label: "Order" },
            { key: "totalAmount", label: "Amount", align: "right" },
          ],
          rows: [],
          summary: { matchingCount: 0, returnedCount: 0 },
        },
      })
    );
    const dataSheet = built.sheets.find((s) => s.name === "Data");
    assert.ok(dataSheet);
    assert.deepEqual(dataSheet!.headers, ["Order", "Amount"]);
    assert.equal(dataSheet!.rows.length, 0);
    const csv = exportSheetsToCsv(built.sheets);
    assert.match(csv, /Order,Amount/);
  });

  it("includes cards sheet for card payloads", () => {
    const built = buildReportExport({
      report: "gst-summary",
      title: "GST Summary",
      category: "financial",
      params: { fy: "25-26", from: null, to: null },
      data: {
        kind: "cards",
        cards: [
          { label: "Taxable", value: 1000 },
          { label: "GST", value: 180 },
        ],
        columns: [{ key: "hsn", label: "HSN" }],
        rows: [{ hsn: "9001" }],
      },
    });
    assert.ok(built.sheets.some((s) => s.name === "Cards"));
    assert.ok(built.sheets.some((s) => s.name === "Data"));
  });
});

describe("xlsx export", () => {
  it("writes a non-empty workbook buffer", async () => {
    const built = buildReportExport(sampleTableResponse());
    const buffer = await exportSheetsToXlsxBuffer(built.sheets);
    assert.ok(buffer.byteLength > 100);
    // ZIP/XLSX magic
    assert.equal(buffer[0], 0x50);
    assert.equal(buffer[1], 0x4b);
  });
});

describe("REPORT_EXPORT_ROW_LIMIT", () => {
  it("is elevated above UI caps", () => {
    assert.ok(REPORT_EXPORT_ROW_LIMIT >= 50_000);
  });
});
