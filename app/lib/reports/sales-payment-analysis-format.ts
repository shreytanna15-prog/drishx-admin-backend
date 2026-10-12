/**
 * Invoice settlement analysis using the same money thresholds as
 * app/lib/finance/payments.ts invoicePaidStatus (0.009).
 *
 * Does NOT use Payment row presence — relies on Invoice.amountPaid /
 * amountOutstanding maintained when payments and credit notes are applied.
 */

/** Same epsilon as finance/payments.ts. */
export const INVOICE_SETTLEMENT_EPS = 0.009;

export type InvoiceSettlementSlice = {
  issuedAt: Date | null;
  amount: unknown;
  amountPaid: unknown;
  amountOutstanding: unknown;
  status: string;
};

export type InvoicePaymentBucket = "paid" | "partial" | "unpaid";

export function classifyInvoiceSettlement(
  inv: Pick<
    InvoiceSettlementSlice,
    "amountPaid" | "amountOutstanding" | "amount"
  >
): InvoicePaymentBucket {
  const paid = Number(inv.amountPaid);
  const outstanding = Number(inv.amountOutstanding);
  if (outstanding <= INVOICE_SETTLEMENT_EPS) return "paid";
  if (paid > INVOICE_SETTLEMENT_EPS) return "partial";
  return "unpaid";
}

export type SalesPaymentAnalysis = {
  paidInvoiceCount: number;
  /** Invoice grand totals for fully settled invoices (sales value, not re-added to period sales). */
  paidInvoiceSales: number;
  /** Sum of amountPaid on fully settled invoices. */
  paidCollected: number;
  partialInvoiceCount: number;
  partialCollected: number;
  partialOutstanding: number;
  unpaidInvoiceCount: number;
  unpaidOutstanding: number;
  /** Sum of amountOutstanding across all invoices with remaining balance. */
  totalOutstanding: number;
  /** Sum of amountPaid across all invoices in the sales universe. */
  totalCollectedOnInvoices: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export function analyzeInvoiceSettlement(
  invoices: InvoiceSettlementSlice[]
): SalesPaymentAnalysis {
  let paidInvoiceCount = 0;
  let paidInvoiceSales = 0;
  let paidCollected = 0;
  let partialInvoiceCount = 0;
  let partialCollected = 0;
  let partialOutstanding = 0;
  let unpaidInvoiceCount = 0;
  let unpaidOutstanding = 0;
  let totalOutstanding = 0;
  let totalCollectedOnInvoices = 0;

  for (const inv of invoices) {
    if (!inv.issuedAt) continue;
    const amount = Number(inv.amount);
    const paid = Number(inv.amountPaid);
    const outstanding = Number(inv.amountOutstanding);
    totalCollectedOnInvoices += paid;
    if (outstanding > INVOICE_SETTLEMENT_EPS) {
      totalOutstanding += outstanding;
    }

    const bucket = classifyInvoiceSettlement(inv);
    if (bucket === "paid") {
      paidInvoiceCount += 1;
      paidInvoiceSales += amount;
      paidCollected += paid;
    } else if (bucket === "partial") {
      partialInvoiceCount += 1;
      partialCollected += paid;
      partialOutstanding += outstanding;
    } else {
      unpaidInvoiceCount += 1;
      unpaidOutstanding += outstanding;
    }
  }

  return {
    paidInvoiceCount,
    paidInvoiceSales: money(paidInvoiceSales),
    paidCollected: money(paidCollected),
    partialInvoiceCount,
    partialCollected: money(partialCollected),
    partialOutstanding: money(partialOutstanding),
    unpaidInvoiceCount,
    unpaidOutstanding: money(unpaidOutstanding),
    totalOutstanding: money(totalOutstanding),
    totalCollectedOnInvoices: money(totalCollectedOnInvoices),
  };
}
