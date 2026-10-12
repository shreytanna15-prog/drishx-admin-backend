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
 * Ready Stock Orders omitted until the business definition is confirmed.
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
