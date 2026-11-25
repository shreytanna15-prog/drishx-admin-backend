/**
 * Create-PO Excel import (RW-08 Phase C).
 *
 * Template (sheet 1, header row 1 — header names are case/space-insensitive):
 *   lensProductPowerId | skuCode | sph | cyl | lensType | lensId | product | power | required | poQuantity | rate
 * Required: poQuantity and either lensProductPowerId, or skuCode+sph+cyl (resolved server-side),
 * or lensType+lensId. `product` / `power` / sku/sph/cyl labels are informational when id is present.
 */

import ExcelJS from "exceljs";
import type { LensType } from "@prisma/client";
import { isProcurementLensType } from "./procurement-rules";

export const PO_IMPORT_COLUMNS = {
  lensProductPowerId: ["lensProductPowerId", "lens_product_power_id", "powerId"],
  skuCode: ["skuCode", "sku_code", "variantSku", "variant_sku"],
  sph: ["sph", "sphere"],
  cyl: ["cyl", "cylinder"],
  lensType: ["lensType", "lens_type", "type"],
  lensId: ["lensId", "lens_id", "id", "sku"],
  required: ["required", "requiredQuantity", "required_qty"],
  poQuantity: ["poQuantity", "po_qty", "po qty", "qty", "quantity", "order_qty"],
  rate: ["rate", "unit_rate", "price"],
} as const;

export const PO_IMPORT_MAX_ROWS = 500;

export type PoImportRow = {
  rowNumber: number;
  lensType: LensType | null;
  lensId: string | null;
  lensProductPowerId: string | null;
  skuCode: string | null;
  sph: number | null;
  cyl: number | null;
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
    lensProductPowerId: findColumn(headers, PO_IMPORT_COLUMNS.lensProductPowerId),
    skuCode: findColumn(headers, PO_IMPORT_COLUMNS.skuCode),
    sph: findColumn(headers, PO_IMPORT_COLUMNS.sph),
    cyl: findColumn(headers, PO_IMPORT_COLUMNS.cyl),
    lensType: findColumn(headers, PO_IMPORT_COLUMNS.lensType),
    lensId: findColumn(headers, PO_IMPORT_COLUMNS.lensId),
    required: findColumn(headers, PO_IMPORT_COLUMNS.required),
    poQuantity: findColumn(headers, PO_IMPORT_COLUMNS.poQuantity),
    rate: findColumn(headers, PO_IMPORT_COLUMNS.rate),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasSkuPowerCols = col.skuCode >= 0 && col.sph >= 0 && col.cyl >= 0;
  if (col.lensProductPowerId < 0 && !hasSkuPowerCols && (col.lensType < 0 || col.lensId < 0)) {
    errors.push("Provide lensProductPowerId, or skuCode+sph+cyl, or both lensType and lensId columns.");
  }
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
    const lensProductPowerId = get(col.lensProductPowerId);
    const skuCode = get(col.skuCode);
    const sphRaw = get(col.sph);
    const cylRaw = get(col.cyl);
    const qtyRaw = get(col.poQuantity);
    if (!lensTypeRaw && !lensId && !lensProductPowerId && !skuCode && !qtyRaw) return;

    if (rows.length + errors.length >= PO_IMPORT_MAX_ROWS) {
      if (rows.length + errors.length === PO_IMPORT_MAX_ROWS) {
        errors.push(`Too many rows — import at most ${PO_IMPORT_MAX_ROWS} lines per PO.`);
      }
      return;
    }
    const lensType = lensTypeRaw ? parseLensType(lensTypeRaw) : null;
    if (lensTypeRaw && !lensType) {
      errors.push(`Row ${rowNumber}: lensType "${lensTypeRaw}" must be SINGLE_VISION, KRYPTOK or PROGRESSIVE.`);
      return;
    }
    let sph: number | null = null;
    let cyl: number | null = null;
    if (skuCode || sphRaw || cylRaw) {
      if (!skuCode || sphRaw === "" || cylRaw === "") {
        errors.push(`Row ${rowNumber}: skuCode, sph, and cyl must be provided together.`);
        return;
      }
      sph = Number(sphRaw);
      cyl = Number(cylRaw);
      if (!Number.isFinite(sph) || !Number.isFinite(cyl)) {
        errors.push(`Row ${rowNumber}: sph and cyl must be numbers.`);
        return;
      }
    }
    if (!lensProductPowerId && !(skuCode && sph != null && cyl != null) && (!lensType || !lensId)) {
      errors.push(`Row ${rowNumber}: provide lensProductPowerId, skuCode+sph+cyl, or lensType+lensId.`);
      return;
    }
    if ((lensType && !lensId) || (!lensType && lensId)) {
      errors.push(`Row ${rowNumber}: lensType and lensId must be provided together.`);
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
    const key = lensProductPowerId
      ? `power:${lensProductPowerId}`
      : skuCode && sph != null && cyl != null
        ? `sku:${skuCode}:${sph}:${cyl}`
        : `${lensType}::${lensId}`;
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      errors.push(`Row ${rowNumber}: the same power already appears on row ${firstRow}. Merge them into one line.`);
      return;
    }
    seen.set(key, rowNumber);
    rows.push({
      rowNumber,
      lensType,
      lensId: lensId || null,
      lensProductPowerId: lensProductPowerId || null,
      skuCode: skuCode || null,
      sph,
      cyl,
      requiredQuantity,
      poQuantity,
      rate,
    });
  });

  if (blankQuantityRows) {
    warnings.push(`${blankQuantityRows} row(s) without a PO quantity were skipped.`);
  }
  if (!rows.length && !errors.length) errors.push("No rows with a PO quantity were found.");
  return { rows, errors, warnings };
}

export type PoImportTemplateRow = {
  lensProductPowerId?: string | null;
  skuCode?: string | null;
  sph?: number | null;
  cyl?: number | null;
  lensType: string | null;
  lensId: string | null;
  product: string | null;
  power: string | null;
  required: number | null;
};

export async function buildPoImportTemplate(prefill: PoImportTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DrishX Procurement";
  const sheet = workbook.addWorksheet("PO import");
  sheet.columns = [
    { header: "lensProductPowerId", key: "lensProductPowerId", width: 34 },
    { header: "skuCode", key: "skuCode", width: 22 },
    { header: "sph", key: "sph", width: 8 },
    { header: "cyl", key: "cyl", width: 8 },
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
    "rate is optional (₹ per unit). Prefer lensProductPowerId, or skuCode+sph+cyl for catalog stock; lensType+lensId remains for legacy.",
    "Each power may appear only once. product/power columns are for reference; labels are re-read from the catalog.",
    "Pre-filled rows come from the open reorder queue at download time.",
  ].forEach((line) => help.addRow([line]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
