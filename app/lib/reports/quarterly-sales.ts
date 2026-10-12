import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { bucketInvoicesByQuarter } from "./period-sales-format";
import type { ReportTablePayload } from "./types";

/**
 * Quarterly sales by calendar quarter (Q1 Jan–Mar … Q4 Oct–Dec) on issuedAt.
 * Same invoice universe as Daily / Monthly Sales.
 */
export async function computeQuarterlySalesReport(
  range: ParsedDateRange
): Promise<ReportTablePayload> {
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
    },
    orderBy: { issuedAt: "asc" },
  });

  const { rows, totals } = bucketInvoicesByQuarter(invoices);

  return {
    kind: "table",
    columns: [
      { key: "quarter", label: "Quarter" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows,
    summary: {
      quarterCount: rows.length,
      invoiceCount: totals.invoiceCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "invoice.issuedAt",
      periodBasis: "calendar quarter (Q1=Jan–Mar)",
    },
  };
}
