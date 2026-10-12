import ExcelJS from "exceljs";
import type { ExportSheet } from "./export-format";

/**
 * Build an .xlsx buffer from export sheets (read-only presentation).
 * Cell values are already sanitized by buildReportExport.
 */
export async function exportSheetsToXlsxBuffer(
  sheets: ExportSheet[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DrishX Reports";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31) || "Sheet");
    let rowIndex = 1;

    if (sheet.headers && sheet.headers.length > 0) {
      const headerRow = ws.getRow(rowIndex);
      sheet.headers.forEach((header, colIndex) => {
        const cell = headerRow.getCell(colIndex + 1);
        cell.value = header;
        cell.font = { bold: true };
      });
      rowIndex += 1;
    }

    for (const row of sheet.rows) {
      const excelRow = ws.getRow(rowIndex);
      row.forEach((value, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1);
        if (value == null) {
          cell.value = null;
        } else if (typeof value === "number") {
          cell.value = value;
        } else {
          cell.value = value;
        }
      });
      rowIndex += 1;
    }

    const colCount = Math.max(
      sheet.headers?.length ?? 0,
      ...sheet.rows.map((r) => r.length),
      1
    );
    for (let c = 1; c <= colCount; c++) {
      const column = ws.getColumn(c);
      let maxLen = 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const text =
          cell.value == null
            ? ""
            : typeof cell.value === "object"
              ? String(cell.value)
              : String(cell.value);
        maxLen = Math.min(48, Math.max(maxLen, text.length + 2));
      });
      column.width = maxLen;
    }
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet("Empty");
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
