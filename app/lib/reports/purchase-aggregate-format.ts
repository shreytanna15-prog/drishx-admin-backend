/** Purchase bill header slice — one row per bill (no line double-count). */
export type PurchaseBillSlice = {
  taxableAmount: unknown;
  cgstAmount: unknown;
  sgstAmount: unknown;
  igstAmount: unknown;
  totalAmount: unknown;
};

export type PurchaseTotals = {
  billCount: number;
  taxable: number;
  gst: number;
  total: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Period purchase totals from bill headers only.
 * GST components match GST Summary input (taxable + cgst/sgst/igst).
 * Grand total uses PurchaseBill.totalAmount (not sum of line totals).
 */
export function sumPurchaseBills(bills: PurchaseBillSlice[]): PurchaseTotals {
  let billCount = 0;
  let taxable = 0;
  let gst = 0;
  let total = 0;

  for (const bill of bills) {
    billCount += 1;
    taxable += Number(bill.taxableAmount);
    gst +=
      Number(bill.cgstAmount) +
      Number(bill.sgstAmount) +
      Number(bill.igstAmount);
    total += Number(bill.totalAmount);
  }

  return {
    billCount,
    taxable: money(taxable),
    gst: money(gst),
    total: money(total),
  };
}
