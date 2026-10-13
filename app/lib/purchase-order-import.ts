/**
 * Create-PO Excel import (RW-08 Phase C).
 *
 * Template (sheet 1, header row 1 — header names are case/space-insensitive):
 *   lensType | lensId | product | power | required | poQuantity | rate
 * Required columns: lensType, lensId, poQuantity. `product` / `power` are
 * informational (labels are always re-read from the catalog). The downloadable
 * template is pre-filled from the open reorder queue so lens ids are exact.
 */

import ExcelJS from "exceljs";
import type { LensType } from "@prisma/client";
import { isProcurementLensType } from "./procurement-rules";

export const PO_IMPORT_COLUMNS = {
  lensType: ["lensType", "lens_type", "type"],
  lensId: ["lensId", "lens_id", "id", "sku"],
  required: ["required", "requiredQuantity", "required_qty"],
  poQuantity: ["poQuantity", "po_qty", "po qty", "qty", "quantity", "order_qty"],
  rate: ["rate", "unit_rate", "price"],
} as const;

export const PO_IMPORT_MAX_ROWS = 500;

export type PoImportRow = {
  rowNumber: number;
  lensType: LensType;
  lensId: string;
  requiredQuantity: number;
  poQuantity: number;
  rate: number | null;
};

export type PoImportParseResult = {
  rows: PoImportRow[];
  errors: string[];
  warnings: string[];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("result" in v) return String(v.result ?? "").trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((part) => String((part as { text?: unknown }).text ?? "")).join("").trim();
    }
  }
  return String(value).trim();
}

function parseLensType(raw: string): LensType | null {
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (isProcurementLensType(upper)) return upper as LensType;
  if (upper === "SV" || upper === "SINGLEVISION") return "SINGLE_VISION";
  if (upper === "KT") return "KRYPTOK";
  if (upper === "PG" || upper === "PROG") return "PROGRESSIVE";
  return null;
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  const wanted = aliases.map(normalizeHeader);
  return headers.findIndex((h) => wanted.includes(h));
}

export async function parsePoImportWorkbook(buffer: Uint8Array): Promise<PoImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  } catch {
    return { rows: [], errors: ["The file is not a readable .xlsx workbook."], warnings: [] };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], errors: ["Workbook has no sheets."], warnings: [] };

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cellText(cell.value));
  });
  const col = {
    lensType: findColumn(headers, PO_IMPORT_COLUMNS.lensType),
    lensId: findColumn(headers, PO_IMPORT_COLUMNS.lensId),
    required: findColumn(headers, PO_IMPORT_COLUMNS.required),
    poQuantity: findColumn(headers, PO_IMPORT_COLUMNS.poQuantity),
    rate: findColumn(headers, PO_IMPORT_COLUMNS.rate),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (col.lensType < 0) errors.push("Missing required column: lensType.");
  if (col.lensId < 0) errors.push("Missing required column: lensId.");
  if (col.poQuantity < 0) errors.push("Missing required column: poQuantity.");
  if (errors.length) return { rows: [], errors, warnings };

  const rows: PoImportRow[] = [];
  const seen = new Map<string, number>();
  let blankQuantityRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (index: number) => (index >= 0 ? cellText(row.getCell(index + 1).value) : "");
    const lensTypeRaw = get(col.lensType);
    const lensId = get(col.lensId);
    const qtyRaw = get(col.poQuantity);
    if (!lensTypeRaw && !lensId && !qtyRaw) return;

    if (rows.length + errors.length >= PO_IMPORT_MAX_ROWS) {
      if (rows.length + errors.length === PO_IMPORT_MAX_ROWS) {
        errors.push(`Too many rows — import at most ${PO_IMPORT_MAX_ROWS} lines per PO.`);
      }
      return;
    }
    const lensType = parseLensType(lensTypeRaw);
    if (!lensType) {
      errors.push(`Row ${rowNumber}: lensType "${lensTypeRaw}" must be SINGLE_VISION, KRYPTOK or PROGRESSIVE.`);
      return;
    }
    if (!lensId) {
      errors.push(`Row ${rowNumber}: lensId is required.`);
      return;
    }
    if (!qtyRaw) {
      // Template rows the user chose not to order are skipped, not errors.
      blankQuantityRows += 1;
      return;
    }
    const poQuantity = Number(qtyRaw);
    if (!Number.isInteger(poQuantity) || poQuantity <= 0) {
      errors.push(`Row ${rowNumber}: poQuantity must be a whole number greater than 0.`);
      return;
    }
    const requiredRaw = get(col.required);
    const requiredQuantity = requiredRaw === "" ? poQuantity : Number(requiredRaw);
    if (!Number.isInteger(requiredQuantity) || requiredQuantity < 0) {
      errors.push(`Row ${rowNumber}: required must be a whole number ≥ 0.`);
      return;
    }
    const rateRaw = get(col.rate).replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
    let rate: number | null = null;
    if (rateRaw !== "") {
      rate = Number(rateRaw);
      if (!Number.isFinite(rate) || rate < 0) {
        errors.push(`Row ${rowNumber}: rate must be a number ≥ 0 or left empty.`);
        return;
      }
      rate = Math.round(rate * 100) / 100;
    }
    const key = `${lensType}::${lensId}`;
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      errors.push(`Row ${rowNumber}: the same power already appears on row ${firstRow}. Merge them into one line.`);
      return;
    }
    seen.set(key, rowNumber);
    rows.push({ rowNumber, lensType, lensId, requiredQuantity, poQuantity, rate });
  });

  if (blankQuantityRows) {
    warnings.push(`${blankQuantityRows} row(s) without a PO quantity were skipped.`);
  }
  if (!rows.length && !errors.length) errors.push("No rows with a PO quantity were found.");
  return { rows, errors, warnings };
}

export type PoImportTemplateRow = {
  lensType: string;
  lensId: string;
  product: string | null;
  power: string | null;
  required: number | null;
};

export async function buildPoImportTemplate(prefill: PoImportTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DrishX Procurement";
  const sheet = workbook.addWorksheet("PO import");
  sheet.columns = [
    { header: "lensType", key: "lensType", width: 16 },
    { header: "lensId", key: "lensId", width: 30 },
    { header: "product", key: "product", width: 36 },
    { header: "power", key: "power", width: 26 },
    { header: "required", key: "required", width: 11 },
    { header: "poQuantity", key: "poQuantity", width: 12 },
    { header: "rate", key: "rate", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of prefill) {
    sheet.addRow({ ...row, poQuantity: row.required ?? null, rate: null });
  }
  const help = workbook.addWorksheet("How to use");
  help.getColumn(1).width = 110;
  [
    "Fill poQuantity (whole number > 0) for each power to order; leave it empty to skip the row.",
    "rate is optional (₹ per unit). lensType/lensId identify the exact power — do not edit them.",
    "Each power may appear only once. product/power columns are for reference; labels are re-read from the catalog.",
    "Pre-filled rows come from the open reorder queue at download time.",
  ].forEach((line) => help.addRow([line]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
