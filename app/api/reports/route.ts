import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  groupReportsForNav,
  listReportDefinitions,
  runReport,
} from "@/app/lib/reports";
import { DEFERRED_REPORTS } from "@/app/lib/reports/deferred-reports";
import {
  CSV_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  buildReportExport,
  exportContentDisposition,
  exportSheetsToCsv,
  isReportPayloadTruncated,
  parseExportFormat,
} from "@/app/lib/reports/export-format";
import { exportSheetsToXlsxBuffer } from "@/app/lib/reports/export-workbook";

/**
 * GET /api/reports
 * - No report= → catalog (definitions grouped by category)
 * - report=<key>&fy=&from=&to= → run report (read-only JSON)
 * - report=<key>&format=csv|xlsx&… → download export (same filters; refuses truncated)
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const reportKey = searchParams.get("report")?.trim() || "";
  const formatRaw = searchParams.get("format");
  const exportFormat =
    formatRaw == null || formatRaw.trim() === ""
      ? null
      : parseExportFormat(formatRaw);

  if (formatRaw != null && formatRaw.trim() !== "" && exportFormat == null) {
    return NextResponse.json(
      { error: "Invalid format. Use csv or xlsx." },
      { status: 400 }
    );
  }

  if (!reportKey) {
    if (exportFormat) {
      return NextResponse.json(
        { error: "Select a report before exporting." },
        { status: 400 }
      );
    }
    // Implemented reports are registered at phase ≤ 4; nav folds power → Inventory.
    const definitions = listReportDefinitions({ phaseMax: 4 });
    return NextResponse.json({
      categories: groupReportsForNav(definitions),
      reports: definitions,
      deferred: DEFERRED_REPORTS,
    });
  }

  const result = await runReport(reportKey, {
    fy: searchParams.get("fy") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    minUnits: searchParams.get("minUnits") ?? undefined,
    maxUnits: searchParams.get("maxUnits") ?? undefined,
    forExport: exportFormat != null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  if (!exportFormat) {
    return NextResponse.json(result.response);
  }

  if (isReportPayloadTruncated(result.response.data)) {
    const rowLimit = result.response.data.meta?.rowLimit;
    return NextResponse.json(
      {
        error:
          "Export refused: result set exceeds the safe export row limit. Narrow the date range or filters and try again.",
        truncated: true,
        rowLimit: typeof rowLimit === "number" ? rowLimit : null,
      },
      { status: 409 }
    );
  }

  try {
    const built = buildReportExport(result.response);
    if (exportFormat === "csv") {
      const csv = exportSheetsToCsv(built.sheets);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": CSV_CONTENT_TYPE,
          "Content-Disposition": exportContentDisposition(
            built.filenameBase,
            "csv"
          ),
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await exportSheetsToXlsxBuffer(built.sheets);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": exportContentDisposition(
          built.filenameBase,
          "xlsx"
        ),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/reports export error:", error);
    return NextResponse.json(
      { error: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
