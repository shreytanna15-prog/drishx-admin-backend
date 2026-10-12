import { formatDateKey } from "./date-range";
import {
  sumInvoiceSales,
  type InvoiceSalesSlice,
  type SalesTotals,
} from "./sales-aggregate-format";

export type { InvoiceSalesSlice, SalesTotals };

/**
 * Bucket invoices by local calendar day (issuedAt).
 * Totals of buckets match sumInvoiceSales for the same set.
 */
export function bucketInvoicesByDay(invoices: InvoiceSalesSlice[]) {
  const money = (n: number) => Math.round(n * 100) / 100;
  const byDay = new Map<
    string,
    { invoiceCount: number; taxable: number; gst: number; total: number }
  >();

  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    const key = formatDateKey(inv.issuedAt);
    const cur = byDay.get(key) ?? {
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
    byDay.set(key, cur);
  }

  const rows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, v]) => ({
      date,
      invoiceCount: v.invoiceCount,
      taxable: money(v.taxable),
      gst: money(v.gst),
      total: money(v.total),
    }));

  const totals = sumInvoiceSales(invoices);

  return { rows, totals };
}
