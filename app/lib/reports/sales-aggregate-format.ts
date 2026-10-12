/** Shared invoice sales slice — Daily / Monthly / Sales Summary. */
export type InvoiceSalesSlice = {
  issuedAt: Date | null;
  taxableAmount: unknown;
  cgstAmount: unknown;
  sgstAmount: unknown;
  igstAmount: unknown;
  amount: unknown;
};

export type SalesTotals = {
  invoiceCount: number;
  taxable: number;
  gst: number;
  total: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Period sales totals from invoice headers (one count / amount per invoice).
 * Same field math as Daily Sales / Monthly Sales / GST output.
 * Skips rows with null issuedAt (matches Daily Sales).
 */
export function sumInvoiceSales(invoices: InvoiceSalesSlice[]): SalesTotals {
  let invoiceCount = 0;
  let taxable = 0;
  let gst = 0;
  let total = 0;

  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    invoiceCount += 1;
    taxable += Number(inv.taxableAmount);
    gst +=
      Number(inv.cgstAmount) + Number(inv.sgstAmount) + Number(inv.igstAmount);
    total += Number(inv.amount);
  }

  return {
    invoiceCount,
    taxable: money(taxable),
    gst: money(gst),
    total: money(total),
  };
}
