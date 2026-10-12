import {
  sumInvoiceSales,
  type InvoiceSalesSlice,
} from "./sales-aggregate-format";

export type { InvoiceSalesSlice };

/** Calendar month key YYYY-MM from a local Date (same local basis as formatDateKey). */
export function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function bucketInvoicesByMonth(invoices: InvoiceSalesSlice[]) {
  const money = (n: number) => Math.round(n * 100) / 100;
  const byMonth = new Map<
    string,
    { invoiceCount: number; taxable: number; gst: number; total: number }
  >();

  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    const key = formatMonthKey(inv.issuedAt);
    const cur = byMonth.get(key) ?? {
      invoiceCount: 0,
      taxable: 0,
      gst: 0,
      total: 0,
    };
    cur.invoiceCount += 1;
    cur.taxable += Number(inv.taxableAmount);
    cur.gst +=
      Number(inv.cgstAmount) + Number(inv.sgstAmount) + Number(inv.igstAmount);
    cur.total += Number(inv.amount);
    byMonth.set(key, cur);
  }

  const rows = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, v]) => ({
      month,
      invoiceCount: v.invoiceCount,
      taxable: money(v.taxable),
      gst: money(v.gst),
      total: money(v.total),
    }));

  const totals = sumInvoiceSales(invoices);

  return { rows, totals };
}
