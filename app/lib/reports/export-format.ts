import type {
  ReportColumn,
  ReportPayload,
  ReportSuccessResponse,
} from "./types";

/** Elevated row cap for CSV/XLSX so exports are complete when possible. */
export const REPORT_EXPORT_ROW_LIMIT = 50_000;

/**
 * Spreadsheet formula-injection prefixes (OWASP).
 * Leading tab/CR are also treated as dangerous.
 */
const FORMULA_INJECTION_RE = /^[=+\-@\t\r]/;

export type ExportFormat = "csv" | "xlsx";

export type ExportSheet = {
  name: string;
  /** First row = headers when present. */
  headers?: string[];
  rows: (string | number | null)[][];
};

export type BuiltExport = {
  sheets: ExportSheet[];
  /** Suggested download basename without extension. */
  filenameBase: string;
};

export function parseExportFormat(
  raw: string | null | undefined
): ExportFormat | null {
  if (raw == null || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "csv" || v === "xlsx") return v;
  return null;
}

export function isReportPayloadTruncated(data: ReportPayload): boolean {
  return data.meta?.truncated === true;
}

/**
 * Sanitize a cell for spreadsheet consumers.
 * Numbers stay numeric; dangerous string prefixes get a leading apostrophe.
 */
export function sanitizeSpreadsheetCell(
  value: string | number | boolean | null | undefined
): string | number | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value);
  if (s === "") return "";
  if (FORMULA_INJECTION_RE.test(s)) {
    return `'${s}`;
  }
  return s;
}

/** RFC-style CSV field escape (after sanitization). */
export function escapeCsvField(value: string | number | null): string {
  if (value == null) return "";
  const s = typeof value === "number" ? formatExportNumber(value) : value;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Stable numeric string for CSV (no locale grouping; keep decimals). */
export function formatExportNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  // Avoid scientific notation for money-scale values; trim trailing zeros lightly.
  const fixed = n.toFixed(6).replace(/\.?0+$/, "");
  return fixed === "-0" ? "0" : fixed;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function kvRows(
  entries: [string, string | number | boolean | null | undefined][]
): (string | number | null)[][] {
  return entries.map(([label, value]) => [
    sanitizeSpreadsheetCell(label) as string,
    sanitizeSpreadsheetCell(
      typeof value === "boolean" ? (value ? "true" : "false") : value
    ),
  ]);
}

function tableMatrix(
  columns: ReportColumn[],
  rows: Record<string, string | number | null>[]
): { headers: string[]; rows: (string | number | null)[][] } {
  const headers = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((col) => sanitizeSpreadsheetCell(row[col.key]))
  );
  return { headers, rows: body };
}

function safeFilenamePart(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Build export sheets from a successful report response.
 * Empty tables still include headers so the file is valid and complete.
 */
export function buildReportExport(response: ReportSuccessResponse): BuiltExport {
  const sheets: ExportSheet[] = [];
  const data = response.data;

  const infoEntries: [string, string | number | boolean | null | undefined][] = [
    ["Report", response.title],
    ["Report key", response.report],
    ["Category", response.category],
    ["Financial year", response.params.fy],
    ["From", response.params.from],
    ["To", response.params.to],
  ];
  if (response.notes) {
    infoEntries.push(["Notes", response.notes]);
  }
  infoEntries.push(["Generated at (UTC)", new Date().toISOString()]);
  const infoRows = kvRows(infoEntries);
  sheets.push({
    name: "Info",
    headers: ["Field", "Value"],
    rows: infoRows,
  });

  if (data.kind === "cards" && data.cards.length > 0) {
    sheets.push({
      name: "Cards",
      headers: ["Label", "Value"],
      rows: data.cards.map((c) => [
        sanitizeSpreadsheetCell(c.label),
        sanitizeSpreadsheetCell(c.value),
      ]),
    });
  }

  if (data.summary && Object.keys(data.summary).length > 0) {
    sheets.push({
      name: "Summary",
      headers: ["Field", "Value"],
      rows: kvRows(
        Object.entries(data.summary).map(([k, v]) => [humanizeKey(k), v])
      ),
    });
  }

  const columns =
    data.kind === "cards" ? (data.columns ?? []) : data.columns;
  const detailRows =
    data.kind === "cards" ? (data.rows ?? []) : data.rows;

  if (columns.length > 0) {
    const matrix = tableMatrix(columns, detailRows);
    sheets.push({
      name: "Data",
      headers: matrix.headers,
      rows: matrix.rows,
    });
  } else if (data.kind === "table") {
    sheets.push({
      name: "Data",
      headers: [],
      rows: [],
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filenameBase = `drishx-${safeFilenamePart(response.report) || "report"}-${dateStamp}`;

  return { sheets, filenameBase };
}

/** Serialize multi-sheet export to a single CSV (sections separated by blank lines). */
export function exportSheetsToCsv(sheets: ExportSheet[]): string {
  const parts: string[] = [];
  for (const sheet of sheets) {
    parts.push(escapeCsvField(sheet.name));
    if (sheet.headers && sheet.headers.length > 0) {
      parts.push(sheet.headers.map((h) => escapeCsvField(h)).join(","));
    }
    for (const row of sheet.rows) {
      parts.push(row.map((cell) => escapeCsvField(cell)).join(","));
    }
    parts.push("");
  }
  // UTF-8 BOM helps Excel open UTF-8 CSV correctly on Windows.
  return `\uFEFF${parts.join("\r\n")}`;
}

export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function exportContentDisposition(
  filenameBase: string,
  format: ExportFormat
): string {
  const ext = format === "csv" ? "csv" : "xlsx";
  const name = `${filenameBase}.${ext}`;
  return `attachment; filename="${name}"`;
}
