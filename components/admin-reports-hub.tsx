"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import { getFinancialYear } from "@/app/lib/finance/financial-year";
import type {
  ReportDefinition,
  ReportPayload,
  ReportSuccessResponse,
} from "@/app/lib/reports/types";
import { cn } from "@/lib/utils";

type CatalogResponse = {
  categories: {
    category: string;
    label: string;
    reports: ReportDefinition[];
  }[];
  reports: ReportDefinition[];
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
  important: string[];
};

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
  const important: string[] = [];

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
        pushIf(primaryKpis, kpiFromSummary(summary, "matchingCount", "Orders", "count"), 4);
        pushIf(primaryKpis, kpiFromSummary(summary, "amountInReturnedRows", "Amount (shown)", "money"), 4);
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
      reportKey === "rx-orders"
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

  // Important information — plain language only.
  if (registryNotes?.trim()) {
    important.push(registryNotes.trim());
  }

  if (data.meta?.truncated === true) {
    important.push(
      "This view shows a limited number of rows. Summary figures still include the full matching set. Narrow the filters if you need every row on screen. Exports are blocked if the full export would still be incomplete."
    );
  }

  if (reportKey === "stock-valuation" && summary) {
    if (summaryGet(summary, "costValuationComplete") === "no") {
      const missingStocked = asNumber(
        summaryGet(summary, "skusMissingCostOnStocked")
      );
      important.push(
        missingStocked != null && missingStocked > 0
          ? `Cost valuation is incomplete. ${count(missingStocked)} in-stock product(s) have no usable cost price, and some lens families do not store cost price. Missing costs are never counted as ₹0.`
          : "Cost valuation is incomplete for some products or lens families. Missing costs are never counted as ₹0."
      );
    }
    if (summaryGet(summary, "sellingValuationComplete") === "no") {
      important.push(
        "Selling valuation is incomplete because some products have no usable selling price. Missing prices are never counted as ₹0."
      );
    }
  }

  if (
    (reportKey === "reserved-stock" || reportKey === "available-stock") &&
    !registryNotes
  ) {
    important.push(
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
      important.push(
        `${count(disabled)} disabled product(s) are excluded from the table and shown only as a count.`
      );
    }
  }

  return {
    primaryKpis: primaryKpis.slice(0, 4),
    secondary: secondaryUnique.slice(0, 8),
    important: important.slice(0, 4),
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

  const buildReportQuery = useCallback(() => {
    if (!selected) return null;
    const params = new URLSearchParams();
    params.set("report", selected.key);
    if (selected.filters === "fy") params.set("fy", fy);
    else if (selected.filters === "dateRange") {
      params.set("from", from);
      params.set("to", to);
    }
    return params;
  }, [selected, fy, from, to]);

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

      {catalogLoading || !catalog ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            aria-label="Reports"
            className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-2.5 shadow-(--brand-card-shadow) lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
          >
            <div className="flex gap-2 overflow-x-auto lg:block lg:overflow-visible">
              {catalog.categories.map((group) => (
                <div
                  key={group.category}
                  className="min-w-[10.5rem] shrink-0 lg:mb-3 lg:min-w-0 lg:last:mb-0"
                >
                  <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-(--brand-primary)">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.reports.map((report) => (
                      <li key={report.key}>
                        <button
                          type="button"
                          onClick={() => selectReport(report.key)}
                          className={cn(
                            "w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition",
                            reportKey === report.key
                              ? "bg-(--brand-primary)/15 text-(--brand-primary)"
                              : "text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)] hover:text-(--brand-text)"
                          )}
                        >
                          {report.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <section className="min-w-0 space-y-3">
            {!selected ? (
              <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
                Select a report to begin.
              </div>
            ) : (
              <>
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
                    {selected.filters === "dateRange" ? (
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
                  <ReportBody
                    result={result}
                    presentation={presentation}
                  />
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </AdminPage>
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

  return (
    <div className="space-y-3">
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

      {presentation.important.length > 0 ? (
        <details className="group rounded-xl border border-(--brand-card-border) bg-(--brand-card) open:shadow-(--brand-card-shadow)">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-(--brand-label) marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              Important information
              <span className="text-(--brand-text-muted) group-open:hidden">
                (show)
              </span>
              <span className="hidden text-(--brand-text-muted) group-open:inline">
                (hide)
              </span>
            </span>
          </summary>
          <ul className="space-y-1.5 border-t border-(--brand-card-border) px-3 py-2.5 text-xs leading-relaxed text-(--brand-text-muted)">
            {presentation.important.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
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
