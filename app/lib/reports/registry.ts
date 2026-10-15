import type { ReportCategory, ReportDefinition } from "./types";

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  financial: "Financial",
  orders: "Orders",
  sales: "Sales",
  inventory: "Inventory",
  power: "Power",
};

/**
 * Reports available in the admin Reports Hub.
 * Profit & Margin remains deferred (see deferred-reports.ts / profit-cogs.ts).
 */
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    key: "gst-summary",
    title: "GST Summary",
    description:
      "Output GST, input GST, and net payable for an Indian financial year.",
    category: "financial",
    phase: 1,
    filters: "fy",
    columns: [
      { key: "label", label: "Metric" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "cgst", label: "CGST", align: "right" },
      { key: "sgst", label: "SGST", align: "right" },
      { key: "igst", label: "IGST", align: "right" },
      { key: "totalGst", label: "Total GST", align: "right" },
    ],
    notes:
      "Based on invoice and purchase dates. Cancelled, void, and draft documents are excluded.",
  },
  {
    key: "sales-summary",
    title: "Sales Summary",
    description:
      "Invoice count, taxable sales, GST, and grand total for the selected period.",
    category: "financial",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Grand total", align: "right" },
    ],
    notes:
      "Cancelled and void invoices are excluded. Paid vs outstanding is shown separately from sales totals.",
  },
  {
    key: "purchase-summary",
    title: "Purchase Summary",
    description:
      "Purchase bill count, taxable purchases, GST, and grand total for the selected period.",
    category: "financial",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "billCount", label: "Bills", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Grand total", align: "right" },
    ],
    notes: "Draft and cancelled bills are excluded.",
  },
  {
    key: "outstanding-customers",
    title: "Outstanding Customers",
    description:
      "Customers with unpaid issued invoices, broken down by aging bucket.",
    category: "financial",
    phase: 1,
    filters: "none",
    columns: [
      { key: "customer", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "aging0_30", label: "0–30", align: "right" },
      { key: "aging31_60", label: "31–60", align: "right" },
      { key: "aging61_90", label: "61–90", align: "right" },
      { key: "aging90plus", label: "90+", align: "right" },
    ],
    notes: "Matches the Receivables aging rules.",
  },
  {
    key: "payment-collection",
    title: "Payment Collection",
    description:
      "Customer payments received in the selected period, including claim-confirmed payments.",
    category: "financial",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "paymentNumber", label: "Payment" },
      { key: "customer", label: "Customer" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "allocated", label: "Allocated", align: "right" },
      { key: "unallocated", label: "Unallocated", align: "right" },
      { key: "mode", label: "Mode" },
      { key: "source", label: "Source" },
      { key: "invoices", label: "Invoices" },
      { key: "paidAt", label: "Paid at" },
    ],
    notes:
      "Claim-confirmed payments are counted once and are not double-counted.",
  },
  {
    key: "pending-orders",
    title: "Pending Orders",
    description: "Orders currently waiting to be processed (Pending status).",
    category: "orders",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    notes: "Pending status only. Filtered by order placed date.",
  },
  {
    key: "completed-orders",
    title: "Completed Orders",
    description: "Orders currently marked as Completed.",
    category: "orders",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    notes: "Filtered by order placed date.",
  },
  {
    key: "cancelled-orders",
    title: "Cancelled Orders",
    description: "Orders currently marked as Cancelled.",
    category: "orders",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    notes: "Filtered by order placed date.",
  },
  {
    key: "rx-orders",
    title: "RX Orders",
    description: "Prescription (RX) orders placed in the selected period.",
    category: "orders",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    notes: "Photo-only orders are not treated as RX.",
  },
  {
    key: "ready-stock-orders",
    title: "Ready Stock Orders",
    description:
      "Non-RX/photo catalog orders that are fully reserved and in PENDING, PICKING, or PACKED — with packed rows marked dispatch-eligible.",
    category: "orders",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "lineType", label: "Line" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "reservedQuantity", label: "Reserved", align: "right" },
      { key: "allocationStatus", label: "Allocation" },
      { key: "dispatchState", label: "Dispatch readiness" },
      { key: "totalAmount", label: "Amount", align: "right" },
      { key: "createdAt", label: "Placed" },
    ],
    notes:
      "Excludes RX, photo-prescription, cancelled/completed/dispatched, awaiting procurement, active warehouse hold, and partial allocation. Wholesale requires every line fully reserved with needsProcurement=false. Aggregate warehouse stock alone never qualifies. Only PACKED is dispatch-eligible; PENDING/PICKING are fully allocated but not packed.",
  },
  {
    key: "daily-sales",
    title: "Daily Sales",
    description: "Invoice sales totals by day for the selected period.",
    category: "sales",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "date", label: "Date" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    notes: "Cancelled and void invoices are excluded.",
  },
  {
    key: "monthly-sales",
    title: "Monthly Sales",
    description: "Invoice sales totals by calendar month.",
    category: "sales",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "month", label: "Month" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    notes: "Cancelled and void invoices are excluded.",
  },
  {
    key: "quarterly-sales",
    title: "Quarterly Sales",
    description: "Invoice sales totals by calendar quarter.",
    category: "sales",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "quarter", label: "Quarter" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    notes: "Calendar quarters (Q1–Q4).",
  },
  {
    key: "yearly-sales",
    title: "Yearly Sales",
    description: "Invoice sales totals by calendar year.",
    category: "sales",
    phase: 1,
    filters: "dateRange",
    columns: [
      { key: "year", label: "Year" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    notes: "Calendar years (January–December).",
  },
  {
    key: "current-stock",
    title: "Current Stock",
    description:
      "Live on-hand quantity for every product across all lens families.",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
    ],
    notes:
      "Disabled products are excluded from the table and shown only as a count.",
  },
  {
    key: "reserved-stock",
    title: "Reserved Stock",
    description:
      "Quantity reserved on open orders (not yet fully picked) by product.",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
    ],
    notes:
      "Shows products with open reservations only. Disabled products are excluded.",
  },
  {
    key: "available-stock",
    title: "Available Stock",
    description:
      "Stock available for new orders after existing reservations.",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" },
    ],
    notes: "Disabled products are excluded from the table.",
  },
  {
    key: "product-wise-stock",
    title: "Product-wise Stock",
    description:
      "Stock rolled up by product line (category, brand, item, and coating).",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "progressiveType", label: "Type" },
      { key: "index", label: "Index" },
      { key: "skuCount", label: "SKUs", align: "right" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" },
    ],
    notes: "Disabled products are excluded. Lens families stay separate.",
  },
  {
    key: "power-wise-stock",
    title: "Power-wise Stock",
    description:
      "Stock by product line and power (SPH, CYL, AXIS, ADD where applicable).",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "progressiveType", label: "Type" },
      { key: "index", label: "Index" },
      { key: "sph", label: "SPH" },
      { key: "cyl", label: "CYL" },
      { key: "axis", label: "AXIS" },
      { key: "add", label: "ADD" },
      { key: "eye", label: "Eye" },
      { key: "skuCount", label: "SKUs", align: "right" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" },
    ],
    notes: "Powers are not merged across different products. Disabled products are excluded.",
  },
  {
    key: "out-of-stock",
    title: "Out of Stock",
    description:
      "Products that are physically empty or fully reserved and unavailable for new orders.",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "classification", label: "Classification" },
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" },
    ],
    notes:
      "Each product appears once as either physically empty or fully reserved. Disabled products are excluded.",
  },
  {
    key: "low-stock",
    title: "Low Stock",
    description:
      "Products at or below their active reorder minimum (available ≤ min stock).",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" },
      { key: "minStock", label: "Min stock", align: "right" },
      { key: "targetStock", label: "Target", align: "right" },
      { key: "deficit", label: "Below min by", align: "right" },
      { key: "stockStatus", label: "Stock status" },
    ],
    notes:
      "Only products with an active reorder rule are listed. There is no global default minimum.",
  },
  {
    key: "stock-valuation",
    title: "Stock Valuation",
    description:
      "Inventory value at cost and at selling price, with clear coverage when prices are missing.",
    category: "inventory",
    phase: 1,
    filters: "none",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "item", label: "Item" },
      { key: "coating", label: "Coating" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "unitCost", label: "Unit cost", align: "right" },
      { key: "costValuation", label: "Cost valuation", align: "right" },
      { key: "costStatus", label: "Cost status" },
      { key: "unitSelling", label: "Unit selling", align: "right" },
      { key: "sellingValuation", label: "Selling valuation", align: "right" },
      { key: "sellingStatus", label: "Selling status" },
    ],
    notes:
      "Cost price is available for Single Vision, Kryptok, and Progressive only. Missing prices are never treated as zero. Disabled products are excluded.",
  },
  {
    key: "fast-moving-powers",
    title: "Fast Moving Powers",
    description:
      "Powers with net sold quantity at or above an admin-entered minimum (default window 90 days).",
    category: "power",
    phase: 4,
    filters: "dateRangeFast",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "label", label: "Product" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "soldQty", label: "Sold (period)", align: "right" },
    ],
    notes:
      "Net sold = issued invoice qty − RETURNED stock movements in the period (floored at 0). Enter minUnits each run — no company-wide default. Prefer a minimum that sits above your Slow maxUnits to avoid overlapping bands.",
  },
  {
    key: "slow-moving-powers",
    title: "Slow Moving Powers",
    description:
      "In-stock powers with positive net sold quantity at or below an admin-entered maximum (default window 90 days).",
    category: "power",
    phase: 4,
    filters: "dateRangeSlow",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "label", label: "Product" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "soldQty", label: "Sold (period)", align: "right" },
    ],
    notes:
      "Requires onHand > 0 and 0 < soldQty ≤ maxUnits. Zero-sales stock is Unsold/Dead, not Slow. Enter maxUnits each run — no company-wide default. Keep maxUnits below Fast minUnits when comparing both reports.",
  },
  {
    key: "dead-powers",
    title: "Dead Powers",
    description:
      "In-stock powers with zero net sales over the preceding 180 days, only when catalog history is long enough.",
    category: "power",
    phase: 4,
    filters: "dateRange",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "label", label: "Product" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "soldQty", label: "Sold (period)", align: "right" },
      { key: "eligibility", label: "Eligibility" },
    ],
    notes:
      "Sales window is forced to 180 days ending on the selected To date (From is ignored for lookback length). Newly introduced SKUs (catalog createdAt within 180 days) are Insufficient History — never labeled Dead. Distinct from Unsold (selected period only).",
  },
  {
    key: "unsold-powers",
    title: "Unsold Powers",
    description:
      "Powers with on-hand stock and zero net sales in the selected period (default 90 days).",
    category: "power",
    phase: 4,
    filters: "dateRange",
    columns: [
      { key: "lensType", label: "Lens type" },
      { key: "label", label: "Product" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "soldQty", label: "Sold (period)", align: "right" },
    ],
    notes:
      "onHand > 0 and soldQty === 0 in the selected window. Does not apply the 180-day Dead history rule.",
  },
  {
    key: "stock-aging",
    title: "Stock Aging",
    description:
      "On-hand stock by last-receipt recency buckets; exact lot age is not claimed when unverifiable.",
    category: "inventory",
    phase: 4,
    filters: "none",
    columns: [
      { key: "recencyBucket", label: "Recency bucket" },
      { key: "ageMeasure", label: "Age measure" },
      { key: "historyStatus", label: "History" },
      { key: "lensType", label: "Lens type" },
      { key: "label", label: "Product" },
      { key: "power", label: "Power" },
      { key: "onHand", label: "On hand", align: "right" },
      { key: "lastReceiptAt", label: "Last receipt" },
      { key: "daysSinceLastReceipt", label: "Days since receipt", align: "right" },
      { key: "unitCost", label: "Unit cost", align: "right" },
      { key: "costValuation", label: "Cost valuation", align: "right" },
    ],
    notes:
      "Buckets 0–30 / 31–60 / 61–90 / 90+ / Unknown from last StockMovement RECEIVED or confirmed Goods Receipt only. This is last-receipt recency, not exact remaining-stock age (older lots may still be on hand). No receipt history → Unknown; dates are never invented. Single Vision / Kryptok / Progressive with on-hand stock.",
  },
];

const BY_KEY = new Map(REPORT_DEFINITIONS.map((r) => [r.key, r]));

export function listReportDefinitions(options?: { phaseMax?: number }) {
  const phaseMax = options?.phaseMax ?? 1;
  return REPORT_DEFINITIONS.filter((r) => r.phase <= phaseMax);
}

export function getReportDefinition(key: string): ReportDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function groupReportsByCategory(defs: ReportDefinition[]) {
  const order: ReportCategory[] = [
    "financial",
    "orders",
    "sales",
    "inventory",
    "power",
  ];
  const grouped = new Map<ReportCategory, ReportDefinition[]>();
  for (const cat of order) grouped.set(cat, []);
  for (const def of defs) {
    const list = grouped.get(def.category) ?? [];
    list.push(def);
    grouped.set(def.category, list);
  }
  return order
    .map((category) => ({
      category,
      label: REPORT_CATEGORY_LABELS[category],
      reports: grouped.get(category) ?? [],
    }))
    .filter((g) => g.reports.length > 0);
}

/**
 * Sidebar / hub navigation category.
 * Power-movement reports stay `category: "power"` in the registry for labeling,
 * but are discovered under Reports → Inventory (no separate Power sidebar item).
 */
export type ReportNavCategory = Exclude<ReportCategory, "power">;

export function reportNavCategory(category: ReportCategory): ReportNavCategory {
  return category === "power" ? "inventory" : category;
}

const NAV_CATEGORY_ORDER: ReportNavCategory[] = [
  "financial",
  "orders",
  "sales",
  "inventory",
];

/** Reports shown together when a nav category (or a report in it) is selected. */
export function reportsInNavCategory(
  defs: ReportDefinition[],
  category: ReportCategory
): ReportDefinition[] {
  const nav = reportNavCategory(category);
  return defs.filter((d) => reportNavCategory(d.category) === nav);
}

/**
 * Catalog grouping for Reports navigation: Financial / Orders / Sales / Inventory.
 * Inventory includes stock reports plus Fast/Slow/Dead/Unsold power reports.
 */
export function groupReportsForNav(defs: ReportDefinition[]) {
  const grouped = new Map<ReportNavCategory, ReportDefinition[]>();
  for (const cat of NAV_CATEGORY_ORDER) grouped.set(cat, []);
  for (const def of defs) {
    const nav = reportNavCategory(def.category);
    const list = grouped.get(nav) ?? [];
    list.push(def);
    grouped.set(nav, list);
  }
  return NAV_CATEGORY_ORDER.map((category) => ({
    category,
    label: REPORT_CATEGORY_LABELS[category],
    reports: grouped.get(category) ?? [],
  })).filter((g) => g.reports.length > 0);
}
