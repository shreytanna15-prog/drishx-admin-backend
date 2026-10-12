import {
  sumInvoiceSales,
  type InvoiceSalesSlice,
} from "./sales-aggregate-format";

const money = (n: number) => Math.round(n * 100) / 100;

/** Calendar quarter label: YYYY-Qn (Q1=Jan–Mar … Q4=Oct–Dec). */
export function formatQuarterKey(date: Date): string {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** Calendar year label: YYYY. */
export function formatYearKey(date: Date): string {
  return String(date.getFullYear());
}

function bucketByKey(
  invoices: InvoiceSalesSlice[],
  keyFn: (d: Date) => string,
  periodColumn: "quarter" | "year"
) {
  const byKey = new Map<
    string,
    { invoiceCount: number; taxable: number; gst: number; total: number }
  >();

  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    const key = keyFn(inv.issuedAt);
    const cur = byKey.get(key) ?? {
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
    byKey.set(key, cur);
  }

  const rows = [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([period, v]) => ({
      [periodColumn]: period,
      invoiceCount: v.invoiceCount,
      taxable: money(v.taxable),
      gst: money(v.gst),
      total: money(v.total),
    }));

  return { rows, totals: sumInvoiceSales(invoices) };
}

export function bucketInvoicesByQuarter(invoices: InvoiceSalesSlice[]) {
  return bucketByKey(invoices, formatQuarterKey, "quarter");
}

export function bucketInvoicesByYear(invoices: InvoiceSalesSlice[]) {
  return bucketByKey(invoices, formatYearKey, "year");
}
