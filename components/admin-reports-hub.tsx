"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Info } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import { getFinancialYear } from "@/app/lib/finance/financial-year";
import {
  DEAD_POWERS_LOOKBACK_DAYS,
  DEFAULT_MOVEMENT_WINDOW_DAYS,
  rollingDateKeys,
} from "@/app/lib/reports/power-movement-format";
import { reportsInNavCategory } from "@/app/lib/reports/registry";
import type {
  ReportDefinition,
  ReportPayload,
  ReportSuccessResponse,
} from "@/app/lib/reports/types";
import { cn } from "@/lib/utils";

type DeferredReportInfo = {
  key: string;
  title: string;
  category: string;
  phase: number;
  blockedOn: string;
};

type CatalogResponse = {
  categories: {
    category: string;
    label: string;
    reports: ReportDefinition[];
  }[];
  reports: ReportDefinition[];
  deferred?: DeferredReportInfo[];
};

type KpiKind = "money" | "count" | "text";

type Kpi = {
  label: string;
  value: string | number;
  kind: KpiKind;
};

type Presentation = {
  primaryKpis: Kpi[];
  secondary: { label: string; value: string }[];
  /** Explanatory methodology shown in the compact ⓘ popover. */
  methodology: string[];
  /** Operational notices (truncation, incomplete valuation) — muted, not warning chrome. */
  notices: string[];
};

/** Verified against `computeSalesSummaryReport` (excludes CANCELLED/VOID; settlement separate). */
const SALES_SUMMARY_METHODOLOGY = [
  "Cancelled and void invoices are excluded from eligible sales totals.",
  "Paid and outstanding amounts help distinguish collections from unpaid balances.",
  "Settlement figures are displayed separately from sales totals.",
] as const;

function methodologyLines(
  reportKey: string,
  registryNotes?: string
): string[] {
  if (reportKey === "sales-summary") {
    return [...SALES_SUMMARY_METHODOLOGY];
  }
  const trimmed = registryNotes?.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function money(n: number) {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function count(n: number) {
  return n.toLocaleString("en-IN");
}

function formatKpi(kpi: Kpi): string {
  if (typeof kpi.value === "string") return kpi.value;
  if (kpi.kind === "money") return money(kpi.value);
  if (kpi.kind === "count") return count(kpi.value);
  return String(kpi.value);
}

function asNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function summaryGet(
  summary: Record<string, string | number | null> | undefined,
  key: string
): string | number | null | undefined {
  return summary?.[key];
}

function inferCardKind(label: string, value: string | number): KpiKind {
  if (typeof value === "string") return "text";
  if (
    /sku|enabled|disabled|product|invoice|bill|count|unit|day|month|quarter|year|customer|rule/i.test(
      label
    ) &&
    !/valuation|subtotal|collected|outstanding|sales|taxable|gst|amount|total|cost|selling/i.test(
      label
    )
  ) {
    return "count";
  }
  if (
    /valuation|collected|outstanding|sales|taxable|gst|subtotal|amount|total|cost|selling|payable/i.test(
      label
    )
  ) {
    return "money";
  }
  if (Number.isInteger(value) && Math.abs(value) < 1_000_000) return "count";
  return "money";
}

function kpiFromSummary(
  summary: Record<string, string | number | null> | undefined,
  key: string,
  label: string,
  kind: KpiKind
): Kpi | null {
  const raw = summaryGet(summary, key);
  if (raw == null || raw === "") return null;
  if (kind === "text") return { label, value: String(raw), kind };
  const n = asNumber(raw);
  if (n == null) return null;
  return { label, value: n, kind };
}

function pushIf(
  list: Kpi[],
  item: Kpi | null,
  max: number
) {
  if (!item || list.length >= max) return;
  list.push(item);
}

/**
 * Curate API payload into business-facing KPIs / secondary stats / caveats.
 * Technical summary keys are never shown raw.
 */
function presentReport(
  reportKey: string,
  data: ReportPayload,
  registryNotes?: string
): Presentation {
  const summary = data.summary;
  const primaryKpis: Kpi[] = [];
  const secondary: { label: string; value: string }[] = [];
  const methodology = methodologyLines(reportKey, registryNotes);
  const notices: string[] = [];

  const addSecondary = (label: string, key: string, kind: KpiKind) => {
    const item = kpiFromSummary(summary, key, label, kind);
    if (!item) return;
    secondary.push({ label, value: formatKpi(item) });
  };

  // Prefer payload cards for primary KPIs (cap at 4).
  if (data.kind === "cards" && data.cards.length > 0) {
    const cards = data.cards;
    const primaryCards = cards.slice(0, 4);
    for (const card of primaryCards) {
      primaryKpis.push({
        label: card.label,
        value: card.value,
        kind: inferCardKind(card.label, card.value),
      });
    }
    for (const card of cards.slice(4)) {
      secondary.push({
        label: card.label,
        value: formatKpi({
          label: card.label,
          value: card.value,
          kind: inferCardKind(card.label, card.value),
        }),
      });
    }
  }

  // Table-only reports: build primary KPIs from curated summary keys.
  if (primaryKpis.length === 0 && summary) {
    switch (reportKey) {
      case "payment-collection":
        pushIf(primaryKpis, kpiFromSummary(summary, "totalCollected", "Total collected", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "matchingCount", "Payments", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "directAmount", "Direct payments", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "claimLinkedAmount", "Claim-linked", "money"), 4);
        break;
      case "outstanding-customers":
        pushIf(primaryKpis, kpiFromSummary(summary, "totalOutstanding", "Total outstanding", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "customerCount", "Customers", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "invoiceCount", "Invoices", "count"), 4);
        break;
      case "pending-orders":
      case "completed-orders":
      case "cancelled-orders":
      case "rx-orders":
      case "ready-stock-orders":
        pushIf(primaryKpis, kpiFromSummary(summary, "matchingCount", "Orders", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "amountInReturnedRows", "Amount (shown)", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "dispatchEligibleCount", "Dispatch-eligible", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "allocatedNotPackedCount", "Allocated (not packed)", "count"), 4);
        break;
      case "fast-moving-powers":
      case "slow-moving-powers":
      case "dead-powers":
      case "unsold-powers":
        pushIf(primaryKpis, kpiFromSummary(summary, "skuCount", "SKUs", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "soldQty", "Sold qty", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "onHand", "On hand", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "deadSkuCount", "Dead", "count"), 4);
        break;
      case "stock-aging":
        pushIf(primaryKpis, kpiFromSummary(summary, "skuCount", "SKUs", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "knownHistorySkus", "Known recency", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "unknownHistorySkus", "Unknown age", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "unknownOnHand", "Unknown on hand", "count"), 4);
        break;
      case "daily-sales":
      case "monthly-sales":
      case "quarterly-sales":
      case "yearly-sales":
        pushIf(primaryKpis, kpiFromSummary(summary, "total", "Grand total", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "taxable", "Taxable", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "gst", "GST", "money"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "invoiceCount", "Invoices", "count"), 4);
        break;
      case "current-stock":
      case "reserved-stock":
      case "available-stock":
      case "product-wise-stock":
      case "power-wise-stock":
        pushIf(primaryKpis, kpiFromSummary(summary, "totalOnHand", "On hand", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "totalCommitted", "Reserved", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "totalAvailable", "Available", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "catalogEnabledCount", "Enabled products", "count"), 4);
        break;
      case "out-of-stock":
        pushIf(primaryKpis, kpiFromSummary(summary, "affectedSkuCount", "Affected products", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "physicalOutOfStockCount", "Physically empty", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "fullyCommittedCount", "Fully reserved", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "unavailableForOrdersCount", "Unavailable for orders", "count"), 4);
        break;
      case "low-stock":
        pushIf(primaryKpis, kpiFromSummary(summary, "lowStockSkuCount", "Low-stock products", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "activeReorderRuleCount", "Active reorder rules", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "alsoPhysicalOutOfStockCount", "Also empty", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "alsoFullyCommittedCount", "Also fully reserved", "count"), 4);
        break;
      default:
        break;
    }
  }

  // Secondary details (compact, never raw keys).
  if (summary) {
    if (reportKey === "payment-collection") {
      addSecondary("Pending claims", "pendingClaimsInPeriod", "count");
      const from = summaryGet(summary, "from");
      const to = summaryGet(summary, "to");
      if (from && to) {
        secondary.push({ label: "Period", value: `${from} → ${to}` });
      }
    }
    if (
      reportKey === "pending-orders" ||
      reportKey === "completed-orders" ||
      reportKey === "cancelled-orders" ||
      reportKey === "rx-orders" ||
      reportKey === "ready-stock-orders"
    ) {
      const matching = asNumber(summaryGet(summary, "matchingCount"));
      const returned = asNumber(summaryGet(summary, "returnedCount"));
      if (matching != null && returned != null && matching !== returned) {
        secondary.push({
          label: "Rows shown",
          value: `${count(returned)} of ${count(matching)}`,
        });
      }
      const from = summaryGet(summary, "from");
      const to = summaryGet(summary, "to");
      if (from && to) {
        secondary.push({ label: "Period", value: `${from} → ${to}` });
      }
    }
    if (
      reportKey.startsWith("current") ||
      reportKey.includes("stock") ||
      reportKey === "out-of-stock" ||
      reportKey === "low-stock" ||
      reportKey === "stock-valuation"
    ) {
      const disabled = asNumber(summaryGet(summary, "disabledProductCount"));
      if (disabled != null && disabled > 0) {
        secondary.push({
          label: "Disabled products (excluded)",
          value: count(disabled),
        });
      }
      const matching = asNumber(summaryGet(summary, "matchingCount"));
      const returned = asNumber(summaryGet(summary, "returnedCount"));
      if (matching != null && returned != null && matching !== returned) {
        secondary.push({
          label: "Rows shown",
          value: `${count(returned)} of ${count(matching)}`,
        });
      }
    }
    if (reportKey === "stock-valuation") {
      addSecondary("Missing cost (in stock)", "skusMissingCostOnStocked", "count");
      addSecondary("Missing selling (in stock)", "skusMissingSellingOnStocked", "count");
      const costComplete = summaryGet(summary, "costValuationComplete");
      const sellComplete = summaryGet(summary, "sellingValuationComplete");
      secondary.push({
        label: "Cost valuation complete",
        value: costComplete === "yes" ? "Yes" : "No",
      });
      secondary.push({
        label: "Selling valuation complete",
        value: sellComplete === "yes" ? "Yes" : "No",
      });
    }
    if (
      reportKey === "sales-summary" ||
      reportKey === "purchase-summary" ||
      reportKey === "daily-sales" ||
      reportKey === "monthly-sales" ||
      reportKey === "quarterly-sales" ||
      reportKey === "yearly-sales"
    ) {
      const from = summaryGet(summary, "from");
      const to = summaryGet(summary, "to");
      if (from && to) {
        secondary.push({ label: "Period", value: `${from} → ${to}` });
      }
    }
    if (reportKey === "gst-summary") {
      const fy = summaryGet(summary, "financialYear");
      if (fy) secondary.push({ label: "Financial year", value: String(fy) });
    }
  }

  // Deduplicate secondary by label (keep first).
  const seenLabels = new Set<string>();
  const secondaryUnique = secondary.filter((s) => {
    if (seenLabels.has(s.label)) return false;
    seenLabels.add(s.label);
    return true;
  });

  if (data.meta?.truncated === true) {
    notices.push(
      "This view shows a limited number of rows. Summary figures still include the full matching set. Narrow the filters if you need every row on screen. Exports are blocked if the full export would still be incomplete."
    );
  }

  if (reportKey === "stock-valuation" && summary) {
    if (summaryGet(summary, "costValuationComplete") === "no") {
      const missingStocked = asNumber(
        summaryGet(summary, "skusMissingCostOnStocked")
      );
      notices.push(
        missingStocked != null && missingStocked > 0
          ? `Cost valuation is incomplete. ${count(missingStocked)} in-stock product(s) have no usable cost price, and some lens families do not store cost price. Missing costs are never counted as ₹0.`
          : "Cost valuation is incomplete for some products or lens families. Missing costs are never counted as ₹0."
      );
    }
    if (summaryGet(summary, "sellingValuationComplete") === "no") {
      notices.push(
        "Selling valuation is incomplete because some products have no usable selling price. Missing prices are never counted as ₹0."
      );
    }
  }

  if (
    (reportKey === "reserved-stock" || reportKey === "available-stock") &&
    methodology.length === 0
  ) {
    methodology.push(
      "Reserved quantity is taken from open orders (held minus already picked)."
    );
  }

  const disabled = asNumber(summaryGet(summary, "disabledProductCount"));
  if (
    disabled != null &&
    disabled > 0 &&
    (reportKey.includes("stock") ||
      reportKey === "out-of-stock" ||
      reportKey === "low-stock")
  ) {
    // Avoid duplicating registry notes that already mention disabled products.
    if (!registryNotes?.toLowerCase().includes("disabled")) {
      methodology.push(
        `${count(disabled)} disabled product(s) are excluded from the table and shown only as a count.`
      );
    }
  }

  return {
    primaryKpis: primaryKpis.slice(0, 4),
    secondary: secondaryUnique.slice(0, 8),
    methodology: methodology.slice(0, 6),
    notices: notices.slice(0, 4),
  };
}

function formatTableCell(
  key: string,
  value: string | number | null | undefined
): string {
  if (value == null || value === "") return "—";

  if (
    key === "costValuationComplete" ||
    key === "sellingValuationComplete"
  ) {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
  }

  const countKeys =
    /Count|invoiceCount|billCount|matchingCount|returnedCount|dayCount|monthCount|quarterCount|yearCount|customerCount|catalogRowCount|catalogEnabledCount|disabledProductCount|skuCount|affectedSkuCount|physicalOutOfStockCount|fullyCommittedCount|unavailableForOrdersCount|activeReorderRuleCount|lowStockSkuCount|alsoPhysicalOutOfStockCount|alsoFullyCommittedCount|minStock|targetStock|deficit|^onHand$|^committed$|^available$|totalOnHand|totalCommitted|totalAvailable|enabledSkuCount|skusWith|skusMissing|onHandCovered|onHandMissing|directCount|claimLinkedCount|^quantity$/i;

  const moneyKeys =
    /amount|total|taxable|gst|outstanding|aging|cgst|sgst|igst|payable|collected|salesOrCollected|paidInvoiceSales|unitCost|unitSelling|costValuation|sellingValuation|costKnownSubtotal|sellingKnownSubtotal/i;

  if (typeof value === "number" || moneyKeys.test(key) || countKeys.test(key)) {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num) && countKeys.test(key)) return count(num);
    if (
      Number.isFinite(num) &&
      moneyKeys.test(key) &&
      !/count|Complete/i.test(key)
    ) {
      return money(num);
    }
  }

  if ((key === "createdAt" || key === "paidAt") && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    }
  }

  if (key === "source") {
    if (value === "confirmed_claim") return "Confirmed claim";
    if (value === "direct") return "Direct payment";
  }

  return String(value);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: key(start), to: key(end) };
}

const POWER_MOVEMENT_REPORT_KEYS = new Set([
  "fast-moving-powers",
  "slow-moving-powers",
  "unsold-powers",
  "dead-powers",
]);

export function AdminReportsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportKey = searchParams.get("report")?.trim() || "";

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  const [fy, setFy] = useState(() => getFinancialYear());
  const defaults = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [minUnits, setMinUnits] = useState("");
  const [maxUnits, setMaxUnits] = useState("");

  const [result, setResult] = useState<ReportSuccessResponse | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState("");
  const [exportLoading, setExportLoading] = useState<"csv" | "xlsx" | null>(
    null
  );
  const [exportError, setExportError] = useState("");

  const selected = useMemo(
    () => catalog?.reports.find((r) => r.key === reportKey) ?? null,
    [catalog, reportKey]
  );

  // Inventory tabs include Fast/Slow/Dead/Unsold (registry category "power").
  const categoryReports = useMemo(() => {
    if (!catalog || !selected) return [];
    return reportsInNavCategory(catalog.reports, selected.category);
  }, [catalog, selected]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const data = await adminFetch<CatalogResponse>("/api/reports");
        if (!cancelled) setCatalog(data);
      } catch (err) {
        if (!cancelled) {
          setCatalogError(
            err instanceof AdminApiError
              ? err.message
              : "Could not load reports. Please refresh and try again."
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectReport = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("report", key);
      router.replace(`/reports?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Missing or invalid ?report= → first registered report (no category URL param).
  useEffect(() => {
    if (!catalog || catalogLoading) return;
    const first = catalog.categories[0]?.reports[0];
    if (!first) return;
    if (!reportKey || !catalog.reports.some((r) => r.key === reportKey)) {
      selectReport(first.key);
    }
  }, [catalog, catalogLoading, reportKey, selectReport]);

  // Power movement: Fast/Slow/Unsold default to 90 days; Dead UI shows 180 (server forces 180 lookback).
  useEffect(() => {
    if (!selected || !POWER_MOVEMENT_REPORT_KEYS.has(selected.key)) return;
    const days =
      selected.key === "dead-powers"
        ? DEAD_POWERS_LOOKBACK_DAYS
        : DEFAULT_MOVEMENT_WINDOW_DAYS;
    const { fromKey, toKey } = rollingDateKeys(days);
    setFrom(fromKey);
    setTo(toKey);
  }, [selected?.key]);

  const buildReportQuery = useCallback(() => {
    if (!selected) return null;
    const params = new URLSearchParams();
    params.set("report", selected.key);
    if (selected.filters === "fy") params.set("fy", fy);
    else if (
      selected.filters === "dateRange" ||
      selected.filters === "dateRangeFast" ||
      selected.filters === "dateRangeSlow"
    ) {
      params.set("from", from);
      params.set("to", to);
      if (selected.filters === "dateRangeFast" && minUnits.trim()) {
        params.set("minUnits", minUnits.trim());
      }
      if (selected.filters === "dateRangeSlow" && maxUnits.trim()) {
        params.set("maxUnits", maxUnits.trim());
      }
    }
    return params;
  }, [selected, fy, from, to, minUnits, maxUnits]);

  const runSelected = useCallback(async () => {
    if (!selected) return;
    const params = buildReportQuery();
    if (!params) return;
    setRunLoading(true);
    setRunError("");
    setExportError("");
    setResult(null);
    try {
      const data = await adminFetch<ReportSuccessResponse>(
        `/api/reports?${params.toString()}`
      );
      setResult(data);
    } catch (err) {
      setRunError(
        err instanceof AdminApiError
          ? err.message
          : "Could not run this report. Please try again."
      );
    } finally {
      setRunLoading(false);
    }
  }, [selected, buildReportQuery]);

  const exportSelected = useCallback(
    async (format: "csv" | "xlsx") => {
      if (!selected) return;
      const params = buildReportQuery();
      if (!params) return;
      params.set("format", format);
      setExportLoading(format);
      setExportError("");
      try {
        const res = await adminAuthFetch(`/api/reports?${params.toString()}`, {
          method: "GET",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Export failed. Please try again."
          );
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = /filename="([^"]+)"/i.exec(disposition);
        const filename =
          match?.[1] ??
          `drishx-${selected.key}-${new Date().toISOString().slice(0, 10)}.${format}`;
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        setExportError(
          err instanceof Error ? err.message : "Export failed. Please try again."
        );
      } finally {
        setExportLoading(null);
      }
    },
    [selected, buildReportQuery]
  );

  useEffect(() => {
    if (!selected) {
      setResult(null);
      setRunError("");
      setExportError("");
      return;
    }
    // Fast/slow need operator thresholds — wait for Run instead of auto-failing.
    if (
      selected.filters === "dateRangeFast" ||
      selected.filters === "dateRangeSlow"
    ) {
      setResult(null);
      setRunError("");
      setExportError("");
      return;
    }
    void runSelected();
  }, [selected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = runLoading || exportLoading != null;

  const presentation = useMemo(() => {
    if (!result || !selected) return null;
    return presentReport(selected.key, result.data, selected.notes);
  }, [result, selected]);

  return (
    <AdminPage
      title="Reports"
      subtitle="Financial, orders, sales, and inventory"
    >
      <div className="mb-4 flex justify-end">
        <Button asChild variant="outline" size="sm" className="h-9 rounded-xl">
          <Link href="/finance/receivables">Receivables</Link>
        </Button>
      </div>

      {catalogError ? (
        <div className="auth-alert-error mb-4" role="alert">
          {catalogError}
        </div>
      ) : null}

      {catalog?.deferred && catalog.deferred.length > 0 ? (
        <details className="mb-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 text-sm shadow-(--brand-card-shadow)">
          <summary className="cursor-pointer font-semibold text-(--brand-text)">
            Reports awaiting client definitions ({catalog.deferred.length})
          </summary>
          <ul className="mt-3 space-y-2 text-(--brand-text-muted)">
            {catalog.deferred.map((item) => (
              <li key={item.key}>
                <span className="font-medium text-(--brand-text)">
                  {item.title}
                </span>
                {" — "}
                {item.blockedOn}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {catalogLoading || !catalog ? (
        <TableSkeleton />
      ) : !selected ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Loading report…
        </div>
      ) : (
        <section className="min-w-0 space-y-4">
          <ReportTabs
            reports={categoryReports}
            activeKey={selected.key}
            onSelect={selectReport}
          />

          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 shadow-(--brand-card-shadow) sm:p-5">
            <h2 className="text-xl font-extrabold tracking-tight text-(--brand-text)">
              {selected.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-(--brand-text-muted)">
              {selected.description}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-(--brand-card-border) pt-4">
              {selected.filters === "fy" ? (
                <label className="grid gap-1 text-xs font-semibold text-(--brand-label)">
                  Financial year
                  <Input
                    value={fy}
                    onChange={(e) => setFy(e.target.value)}
                    placeholder="25-26"
                    className="h-9 w-28 border-(--brand-input-border) bg-(--brand-input-bg)"
                  />
                </label>
              ) : null}
              {selected.filters === "dateRange" ||
              selected.filters === "dateRangeFast" ||
              selected.filters === "dateRangeSlow" ? (
                <>
                  <label className="grid gap-1 text-xs font-semibold text-(--brand-label)">
                    From
                    <Input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="h-9 min-w-[9rem] border-(--brand-input-border) bg-(--brand-input-bg)"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-(--brand-label)">
                    To
                    <Input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-9 min-w-[9rem] border-(--brand-input-border) bg-(--brand-input-bg)"
                    />
                  </label>
                </>
              ) : null}
              {selected.filters === "dateRangeFast" ? (
                <label className="grid gap-1 text-xs font-semibold text-(--brand-label)">
                  Min sold qty
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={minUnits}
                    onChange={(e) => setMinUnits(e.target.value)}
                    placeholder="Required"
                    className="h-9 w-28 border-(--brand-input-border) bg-(--brand-input-bg)"
                  />
                </label>
              ) : null}
              {selected.filters === "dateRangeSlow" ? (
                <label className="grid gap-1 text-xs font-semibold text-(--brand-label)">
                  Max sold qty
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={maxUnits}
                    onChange={(e) => setMaxUnits(e.target.value)}
                    placeholder="Required"
                    className="h-9 w-28 border-(--brand-input-border) bg-(--brand-input-bg)"
                  />
                </label>
              ) : null}
              {selected.filters !== "none" ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void runSelected()}
                  className="h-9 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
                >
                  {runLoading ? "Running…" : "Run"}
                </Button>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void exportSelected("csv")}
                  className="h-9 rounded-xl"
                >
                  <Download className="mr-1.5 size-3.5 opacity-70" />
                  {exportLoading === "csv" ? "…" : "CSV"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void exportSelected("xlsx")}
                  className="h-9 rounded-xl"
                >
                  <FileSpreadsheet className="mr-1.5 size-3.5 opacity-70" />
                  {exportLoading === "xlsx" ? "…" : "Excel"}
                </Button>
              </div>
            </div>
          </div>

          {runError ? (
            <div className="auth-alert-error" role="alert">
              {runError}
            </div>
          ) : null}
          {exportError ? (
            <div className="auth-alert-error" role="alert">
              {exportError}
            </div>
          ) : null}

          {runLoading ? (
            <TableSkeleton />
          ) : result && presentation ? (
            <ReportBody result={result} presentation={presentation} />
          ) : null}
        </section>
      )}
    </AdminPage>
  );
}

function ReportTabs({
  reports,
  activeKey,
  onSelect,
}: {
  reports: ReportDefinition[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = useCallback((index: number) => {
    const el = tabRefs.current[index];
    el?.focus();
  }, []);

  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (reports.length === 0) return;
      let next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        next = (index + 1) % reports.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        next = (index - 1 + reports.length) % reports.length;
      } else if (event.key === "Home") {
        event.preventDefault();
        next = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        next = reports.length - 1;
      } else {
        return;
      }
      onSelect(reports[next]!.key);
      focusTab(next);
    },
    [focusTab, onSelect, reports]
  );

  if (reports.length === 0) return null;

  return (
    <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-3 shadow-(--brand-card-shadow) sm:p-3.5">
      <div className="md:hidden">
        <label className="mb-1.5 block text-xs font-semibold text-(--brand-label)">
          Report
        </label>
        <Select value={activeKey} onValueChange={onSelect}>
          <SelectTrigger
            className="h-10 w-full border-(--brand-input-border) bg-(--brand-input-bg)"
            aria-label="Select report"
          >
            <SelectValue placeholder="Select report" />
          </SelectTrigger>
          <SelectContent>
            {reports.map((report) => (
              <SelectItem key={report.key} value={report.key}>
                {report.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="hidden flex-wrap gap-2 md:flex"
        role="tablist"
        aria-label="Reports in this category"
      >
        {reports.map((report, index) => {
          const isActive = report.key === activeKey;
          return (
            <button
              key={report.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(report.key)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "h-9 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50",
                isActive
                  ? "border-(--brand-primary) bg-(--brand-primary)/15 text-(--brand-primary)"
                  : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:text-(--brand-text)"
              )}
            >
              {report.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportMethodologyHint({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-(--brand-text-muted)",
          "transition-colors hover:bg-muted hover:text-(--brand-text)",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "aria-expanded:bg-muted aria-expanded:text-(--brand-text)"
        )}
        aria-label="How report totals are calculated"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
        role="note"
      >
        <p className="text-xs font-semibold text-(--brand-text)">
          How report totals are calculated
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-(--brand-text-muted)">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ReportBody({
  result,
  presentation,
}: {
  result: ReportSuccessResponse;
  presentation: Presentation;
}) {
  const data = result.data;
  const columns = data.kind === "cards" ? (data.columns ?? []) : data.columns;
  const rows = data.kind === "cards" ? (data.rows ?? []) : data.rows;
  const showSummaryHeader =
    presentation.methodology.length > 0 || presentation.primaryKpis.length > 0;

  return (
    <div className="space-y-3">
      {showSummaryHeader ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--brand-label)">
            Summary
          </p>
          <ReportMethodologyHint lines={presentation.methodology} />
        </div>
      ) : null}

      {presentation.primaryKpis.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {presentation.primaryKpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-3 py-3 shadow-(--brand-card-shadow) sm:px-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-(--brand-label)">
                {kpi.label}
              </p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-(--brand-text) sm:text-xl">
                {formatKpi(kpi)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {presentation.notices.length > 0 ? (
        <ul className="space-y-1 text-xs leading-relaxed text-(--brand-text-muted)">
          {presentation.notices.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {presentation.secondary.length > 0 ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--brand-text-muted)">
          {presentation.secondary.map((item) => (
            <span key={item.label}>
              <span className="font-semibold text-(--brand-label)">
                {item.label}
              </span>
              {": "}
              <span className="tabular-nums text-(--brand-text)">
                {item.value}
              </span>
            </span>
          ))}
        </p>
      ) : null}

      {columns.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
          {rows.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-(--brand-text-muted)">
              No results for the selected filters.
            </p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-(--brand-card-border) bg-[rgba(0,0,0,0.02)] text-left text-(--brand-label) dark:bg-[rgba(255,255,255,0.02)]">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-xs font-semibold sm:px-4",
                        col.align === "right" && "text-right"
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-b border-(--brand-card-border) last:border-b-0"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2 text-(--brand-text) sm:px-4",
                          col.align === "right" && "text-right tabular-nums"
                        )}
                      >
                        {formatTableCell(col.key, row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
