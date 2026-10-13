/**
 * Power-wise receive Excel parser (RW-08 Phase B).
 *
 * Client template is not final — column mapping is isolated here.
 * Default map documents the expected DrishX interim template; update
 * RECEIVE_EXCEL_COLUMN_MAP when the client template arrives.
 */

import ExcelJS from "exceljs";
import { LensType } from "@prisma/client";
import { isProcurementLensType } from "./procurement-lens";

/** Documented interim template headers (row 1). Easy to remount later. */
export const RECEIVE_EXCEL_COLUMN_MAP = {
  lensType: ["lensType", "lens_type", "type"],
  lensId: ["lensId", "lens_id", "id", "sku"],
  productLabel: ["product", "productLabel", "product_label", "item"],
  rangeLabel: ["range", "rangeLabel", "range_label"],
  powerLabel: ["power", "powerLabel", "power_label"],
  sph: ["sph", "sphere"],
  cyl: ["cyl", "cylinder"],
  quantity: ["quantity", "qty", "delivered", "received", "deliveredQuantity"],
  damaged: ["damaged", "damagedQuantity", "reject", "rejected"],
} as const;

export type ParsedExcelDelivery = {
  rowNumber: number;
  lensType: LensType;
  lensId: string;
  productLabel: string | null;
  rangeLabel: string | null;
  powerLabel: string | null;
  sph: number | null;
  cyl: number | null;
  deliveredQuantity: number;
  damagedQuantity: number;
};

export type ExcelParseResult = {
  rows: ParsedExcelDelivery[];
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
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return String((value as { result: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  const text = cellText(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function findColumn(
  headers: string[],
  aliases: readonly string[]
): number {
  const normalizedAliases = aliases.map((a) => normalizeHeader(a));
  for (let i = 0; i < headers.length; i++) {
    if (normalizedAliases.includes(headers[i]!)) return i;
  }
  return -1;
}

function parseLensType(raw: string): LensType | null {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if (isProcurementLensType(upper)) return upper as LensType;
  if (upper === "SV" || upper === "SINGLEVISION") return LensType.SINGLE_VISION;
  if (upper === "KT" || upper === "KRYPTO") return LensType.KRYPTOK;
  if (upper === "PG" || upper === "PROG") return LensType.PROGRESSIVE;
  return null;
}

/**
 * Parse a power-wise receive workbook buffer.
 * Requires lensType + lensId + quantity columns (by alias map).
 */
export async function parseReceiveExcelBuffer(
  buffer: ArrayBuffer | Buffer
): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer =
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  // exceljs typings expect Buffer; runtime accepts Node Buffer.
  await workbook.xlsx.load(nodeBuffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: ["Workbook has no sheets."], warnings: [] };
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cell.value);
  });

  const col = {
    lensType: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.lensType),
    lensId: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.lensId),
    productLabel: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.productLabel),
    rangeLabel: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.rangeLabel),
    powerLabel: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.powerLabel),
    sph: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.sph),
    cyl: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.cyl),
    quantity: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.quantity),
    damaged: findColumn(headers, RECEIVE_EXCEL_COLUMN_MAP.damaged),
  };

  const errors: string[] = [];
  const warnings: string[] = [];
  if (col.lensType < 0) errors.push("Missing required column: lensType.");
  if (col.lensId < 0) errors.push("Missing required column: lensId.");
  if (col.quantity < 0) errors.push("Missing required column: quantity.");
  if (errors.length) return { rows: [], errors, warnings };

  const rows: ParsedExcelDelivery[] = [];
  const seenKeys = new Set<string>();

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const lensTypeRaw = cellText(row.getCell(col.lensType + 1).value);
    const lensId = cellText(row.getCell(col.lensId + 1).value);
    if (!lensTypeRaw && !lensId) return;

    const lensType = parseLensType(lensTypeRaw);
    const qtyRaw = cellNumber(row.getCell(col.quantity + 1).value);
    const damagedRaw =
      col.damaged >= 0 ? cellNumber(row.getCell(col.damaged + 1).value) : 0;

    if (!lensType) {
      errors.push(`Row ${rowNumber}: invalid lensType "${lensTypeRaw}".`);
      return;
    }
    if (!lensId) {
      errors.push(`Row ${rowNumber}: lensId is required.`);
      return;
    }
    if (qtyRaw == null || !Number.isInteger(qtyRaw) || qtyRaw < 0) {
      errors.push(`Row ${rowNumber}: quantity must be a whole number ≥ 0.`);
      return;
    }
    const damagedQuantity = damagedRaw == null ? 0 : damagedRaw;
    if (!Number.isInteger(damagedQuantity) || damagedQuantity < 0) {
      errors.push(`Row ${rowNumber}: damaged must be a whole number ≥ 0.`);
      return;
    }

    const key = `${lensType}::${lensId}`;
    if (seenKeys.has(key)) {
      warnings.push(
        `Row ${rowNumber}: duplicate power ${key} — quantities will be summed.`
      );
    }
    seenKeys.add(key);

    const sph =
      col.sph >= 0 ? cellNumber(row.getCell(col.sph + 1).value) : null;
    const cyl =
      col.cyl >= 0 ? cellNumber(row.getCell(col.cyl + 1).value) : null;

    rows.push({
      rowNumber,
      lensType,
      lensId,
      productLabel:
        col.productLabel >= 0
          ? cellText(row.getCell(col.productLabel + 1).value) || null
          : null,
      rangeLabel:
        col.rangeLabel >= 0
          ? cellText(row.getCell(col.rangeLabel + 1).value) || null
          : null,
      powerLabel:
        col.powerLabel >= 0
          ? cellText(row.getCell(col.powerLabel + 1).value) || null
          : null,
      sph,
      cyl,
      deliveredQuantity: Math.trunc(qtyRaw),
      damagedQuantity,
    });
  });

  if (!rows.length && !errors.length) {
    errors.push("Excel contains no data rows.");
  }

  return { rows, errors, warnings };
}
