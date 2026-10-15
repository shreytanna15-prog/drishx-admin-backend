import { getFinancialYear } from "@/app/lib/finance/financial-year";
import { resolveReportDateRange } from "./date-range";
import { REPORT_EXPORT_ROW_LIMIT } from "./export-format";
import { computeDailySalesReport } from "./daily-sales";
import { computeGstSummary } from "./gst-summary";
import { gstSummaryToReportPayload } from "./gst-summary-format";
import {
  computeAvailableStockReport,
  computeCurrentStockReport,
  computeLowStockReport,
  computeOutOfStockReport,
  computePowerWiseStockReport,
  computeProductWiseStockReport,
  computeReservedStockReport,
  computeStockValuationReport,
} from "./inventory-stock";
import { computeMonthlySalesReport } from "./monthly-sales";
import {
  computeCancelledOrdersReport,
  computeCompletedOrdersReport,
  computePendingOrdersReport,
  computeRxOrdersReport,
} from "./order-list";
import { computeOutstandingCustomersReport } from "./outstanding-customers";
import { computePaymentCollectionReport } from "./payment-collection";
import { computePurchaseSummaryReport } from "./purchase-summary";
import { computeQuarterlySalesReport } from "./quarterly-sales";
import { getReportDefinition } from "./registry";
import { computeSalesSummaryReport } from "./sales-summary";
import { computeYearlySalesReport } from "./yearly-sales";
import {
  PowerMovementParamError,
  computePowerMovementReport,
} from "./power-movement";
import { parseNonNegativeNumber } from "./power-movement-format";
import { computeReadyStockOrdersReport } from "./ready-stock";
import { computeStockAgingReport } from "./stock-aging";
import type { ReportRunParams, ReportSuccessResponse } from "./types";

export type RunReportResult =
  | { ok: true; response: ReportSuccessResponse }
  | { ok: false; status: number; error: string };

const DATE_RANGE_REPORTS = new Set([
  "sales-summary",
  "purchase-summary",
  "payment-collection",
  "pending-orders",
  "completed-orders",
  "cancelled-orders",
  "rx-orders",
  "daily-sales",
  "monthly-sales",
  "quarterly-sales",
  "yearly-sales",
  "dead-powers",
  "unsold-powers",
  "fast-moving-powers",
  "slow-moving-powers",
  "ready-stock-orders",
]);

export async function runReport(
  reportKey: string,
  params: ReportRunParams
): Promise<RunReportResult> {
  const def = getReportDefinition(reportKey);
  if (!def) {
    return { ok: false, status: 400, error: "Unknown report." };
  }
  if (def.phase > 4) {
    return {
      ok: false,
      status: 400,
      error: "This report is not available in the current delivery phase.",
    };
  }

  const fy = params.fy?.trim() || getFinancialYear();
  const exportRowLimit = params.forExport
    ? REPORT_EXPORT_ROW_LIMIT
    : undefined;
  const listRunOptions =
    exportRowLimit != null ? { rowLimit: exportRowLimit } : undefined;

  try {
    if (def.key === "gst-summary") {
      const result = await computeGstSummary(fy);
      return {
        ok: true,
        response: {
          report: def.key,
          title: def.title,
          category: def.category,
          notes: def.notes,
          params: { fy: result.financialYear, from: null, to: null },
          data: gstSummaryToReportPayload(result),
        },
      };
    }

    if (def.key === "outstanding-customers") {
      const data = await computeOutstandingCustomersReport();
      return {
        ok: true,
        response: {
          report: def.key,
          title: def.title,
          category: def.category,
          notes: def.notes,
          params: { fy: null, from: null, to: null },
          data,
        },
      };
    }

    if (
      def.key === "current-stock" ||
      def.key === "reserved-stock" ||
      def.key === "available-stock" ||
      def.key === "product-wise-stock" ||
      def.key === "power-wise-stock" ||
      def.key === "out-of-stock" ||
      def.key === "low-stock" ||
      def.key === "stock-valuation"
    ) {
      let data;
      switch (def.key) {
        case "current-stock":
          data = await computeCurrentStockReport(listRunOptions);
          break;
        case "reserved-stock":
          data = await computeReservedStockReport(listRunOptions);
          break;
        case "available-stock":
          data = await computeAvailableStockReport(listRunOptions);
          break;
        case "product-wise-stock":
          data = await computeProductWiseStockReport(listRunOptions);
          break;
        case "power-wise-stock":
          data = await computePowerWiseStockReport(listRunOptions);
          break;
        case "out-of-stock":
          data = await computeOutOfStockReport(listRunOptions);
          break;
        case "low-stock":
          data = await computeLowStockReport(listRunOptions);
          break;
        case "stock-valuation":
          data = await computeStockValuationReport(listRunOptions);
          break;
      }
      return {
        ok: true,
        response: {
          report: def.key,
          title: def.title,
          category: def.category,
          notes: def.notes,
          params: { fy: null, from: null, to: null },
          data,
        },
      };
    }

    if (def.key === "stock-aging") {
      const data = await computeStockAgingReport(listRunOptions);
      return {
        ok: true,
        response: {
          report: def.key,
          title: def.title,
          category: def.category,
          notes: def.notes,
          params: { fy: null, from: null, to: null },
          data,
        },
      };
    }

    if (DATE_RANGE_REPORTS.has(def.key)) {
      const resolved = resolveReportDateRange({
        from: params.from,
        to: params.to,
        fy: params.fy,
      });
      if (!resolved.ok) {
        return { ok: false, status: 400, error: resolved.error };
      }

      const range = resolved.range;
      let data;
      try {
        switch (def.key) {
          case "sales-summary":
            data = await computeSalesSummaryReport(range);
            break;
          case "purchase-summary":
            data = await computePurchaseSummaryReport(range);
            break;
          case "payment-collection":
            data = await computePaymentCollectionReport(range, listRunOptions);
            break;
          case "pending-orders":
            data = await computePendingOrdersReport(range, listRunOptions);
            break;
          case "completed-orders":
            data = await computeCompletedOrdersReport(range, listRunOptions);
            break;
          case "cancelled-orders":
            data = await computeCancelledOrdersReport(range, listRunOptions);
            break;
          case "rx-orders":
            data = await computeRxOrdersReport(range, listRunOptions);
            break;
          case "ready-stock-orders":
            data = await computeReadyStockOrdersReport(range, listRunOptions);
            break;
          case "daily-sales":
            data = await computeDailySalesReport(range);
            break;
          case "monthly-sales":
            data = await computeMonthlySalesReport(range);
            break;
          case "quarterly-sales":
            data = await computeQuarterlySalesReport(range);
            break;
          case "yearly-sales":
            data = await computeYearlySalesReport(range);
            break;
          case "dead-powers":
            data = await computePowerMovementReport(
              "dead",
              range,
              {},
              listRunOptions
            );
            break;
          case "unsold-powers":
            data = await computePowerMovementReport(
              "unsold",
              range,
              {},
              listRunOptions
            );
            break;
          case "fast-moving-powers": {
            const minUnits = parseNonNegativeNumber(params.minUnits);
            if (minUnits == null) {
              return {
                ok: false,
                status: 400,
                error:
                  "Enter a minimum sold quantity (minUnits) for Fast Moving Powers. No company default is configured.",
              };
            }
            data = await computePowerMovementReport(
              "fast",
              range,
              { minUnits },
              listRunOptions
            );
            break;
          }
          case "slow-moving-powers": {
            const maxUnits = parseNonNegativeNumber(params.maxUnits);
            if (maxUnits == null) {
              return {
                ok: false,
                status: 400,
                error:
                  "Enter a maximum sold quantity (maxUnits) for Slow Moving Powers. No company default is configured.",
              };
            }
            data = await computePowerMovementReport(
              "slow",
              range,
              { maxUnits },
              listRunOptions
            );
            break;
          }
          default:
            return { ok: false, status: 400, error: "Unknown report." };
        }
      } catch (err) {
        if (err instanceof PowerMovementParamError) {
          return { ok: false, status: 400, error: err.message };
        }
        throw err;
      }

      return {
        ok: true,
        response: {
          report: def.key,
          title: def.title,
          category: def.category,
          notes: def.notes,
          params: {
            fy: params.from || params.to ? null : fy,
            from: range.fromKey,
            to: range.toKey,
          },
          data,
        },
      };
    }

    return { ok: false, status: 400, error: "Unknown report." };
  } catch (error) {
    console.error(`runReport(${reportKey}) error:`, error);
    return { ok: false, status: 500, error: "Internal Server Error" };
  }
}
