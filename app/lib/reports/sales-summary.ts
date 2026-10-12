import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { sumInvoiceSales } from "./sales-aggregate-format";
import { analyzeInvoiceSettlement } from "./sales-payment-analysis-format";
import type { ReportCardsPayload } from "./types";

/**
 * Sales Summary — period sales totals (Daily/Monthly/GST universe) plus
 * separate settlement analysis from Invoice amountPaid / amountOutstanding.
 */
export async function computeSalesSummaryReport(
  range: ParsedDateRange
): Promise<ReportCardsPayload> {
  const invoices = await prisma.invoice.findMany({
    where: {
      issuedAt: { gte: range.from, lte: range.to },
      status: { notIn: ["CANCELLED", "VOID"] },
    },
    select: {
      issuedAt: true,
      taxableAmount: true,
      cgstAmount: true,
      sgstAmount: true,
      igstAmount: true,
      amount: true,
      amountPaid: true,
      amountOutstanding: true,
      status: true,
    },
  });

  const totals = sumInvoiceSales(invoices);
  const settlement = analyzeInvoiceSettlement(invoices);

  return {
    kind: "cards",
    cards: [
      { label: "Invoices", value: totals.invoiceCount },
      { label: "Taxable sales", value: totals.taxable },
      { label: "GST", value: totals.gst },
      { label: "Grand total", value: totals.total },
      { label: "Fully paid (invoices)", value: settlement.paidInvoiceCount },
      { label: "Collected on invoices", value: settlement.totalCollectedOnInvoices },
      { label: "Outstanding", value: settlement.totalOutstanding },
      {
        label: "Partially paid (invoices)",
        value: settlement.partialInvoiceCount,
      },
    ],
    columns: [
      { key: "bucket", label: "Settlement" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "salesOrCollected", label: "Sales / collected", align: "right" },
      { key: "outstanding", label: "Outstanding", align: "right" },
    ],
    rows:
      totals.invoiceCount === 0
        ? []
        : [
            {
              bucket: "Period sales (all qualifying)",
              invoiceCount: totals.invoiceCount,
              salesOrCollected: totals.total,
              outstanding: null,
            },
            {
              bucket: "Fully paid",
              invoiceCount: settlement.paidInvoiceCount,
              salesOrCollected: settlement.paidInvoiceSales,
              outstanding: 0,
            },
            {
              bucket: "Partially paid",
              invoiceCount: settlement.partialInvoiceCount,
              salesOrCollected: settlement.partialCollected,
              outstanding: settlement.partialOutstanding,
            },
            {
              bucket: "Unpaid",
              invoiceCount: settlement.unpaidInvoiceCount,
              salesOrCollected: 0,
              outstanding: settlement.unpaidOutstanding,
            },
          ],
    summary: {
      invoiceCount: totals.invoiceCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      paidInvoiceCount: settlement.paidInvoiceCount,
      paidInvoiceSales: settlement.paidInvoiceSales,
      partialInvoiceCount: settlement.partialInvoiceCount,
      partialCollected: settlement.partialCollected,
      partialOutstanding: settlement.partialOutstanding,
      unpaidInvoiceCount: settlement.unpaidInvoiceCount,
      unpaidOutstanding: settlement.unpaidOutstanding,
      totalCollectedOnInvoices: settlement.totalCollectedOnInvoices,
      totalOutstanding: settlement.totalOutstanding,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "invoice.issuedAt",
      statusFilter: "excludes CANCELLED, VOID",
      settlementBasis: "invoice.amountPaid / amountOutstanding (ε=0.009)",
    },
    meta: {
      note: "Settlement rows are analysis only — do not add to period sales totals.",
    },
  };
}
