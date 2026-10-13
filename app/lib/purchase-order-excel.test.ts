import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseReceiveExcelBuffer } from "./purchase-order-excel";

async function workbookBuffer(
  headers: string[],
  rows: unknown[][]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

describe("parseReceiveExcelBuffer", () => {
  it("parses a valid interim template", async () => {
    const buf = await workbookBuffer(
      ["lensType", "lensId", "product", "range", "power", "quantity", "damaged"],
      [
        ["SINGLE_VISION", "lens-1", "SV Blue", "1.56", "-1.00", 40, 2],
        ["SV", "lens-2", "SV Blue", "1.56", "-2.00", 10, 0],
      ]
    );
    const result = await parseReceiveExcelBuffer(buf);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]!.lensType, "SINGLE_VISION");
    assert.equal(result.rows[0]!.deliveredQuantity, 40);
    assert.equal(result.rows[0]!.damagedQuantity, 2);
    assert.equal(result.rows[1]!.lensType, "SINGLE_VISION");
  });

  it("requires lensType, lensId and quantity columns", async () => {
    const buf = await workbookBuffer(["product", "qty"], [["x", 1]]);
    const result = await parseReceiveExcelBuffer(buf);
    assert.ok(result.errors.some((e) => e.includes("lensType")));
    assert.ok(result.errors.some((e) => e.includes("lensId")));
    assert.equal(result.rows.length, 0);
  });

  it("rejects invalid lens types and non-integer quantities", async () => {
    const buf = await workbookBuffer(
      ["lensType", "lensId", "quantity"],
      [
        ["WIDGET", "lens-1", 5],
        ["SINGLE_VISION", "lens-2", 1.5],
        ["SINGLE_VISION", "", 3],
      ]
    );
    const result = await parseReceiveExcelBuffer(buf);
    assert.ok(result.errors.some((e) => e.includes("invalid lensType")));
    assert.ok(result.errors.some((e) => e.includes("whole number")));
    assert.ok(result.errors.some((e) => e.includes("lensId is required")));
  });

  it("warns on duplicate powers", async () => {
    const buf = await workbookBuffer(
      ["lensType", "lensId", "quantity"],
      [
        ["SINGLE_VISION", "lens-1", 5],
        ["SINGLE_VISION", "lens-1", 3],
      ]
    );
    const result = await parseReceiveExcelBuffer(buf);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 2);
    assert.ok(result.warnings.some((w) => w.toLowerCase().includes("duplicate")));
  });

  it("errors on empty workbook data", async () => {
    const buf = await workbookBuffer(
      ["lensType", "lensId", "quantity"],
      []
    );
    const result = await parseReceiveExcelBuffer(buf);
    assert.ok(result.errors.some((e) => e.includes("no data")));
  });
});
