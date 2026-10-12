import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { bucketInvoicesByYear } from "./period-sales-format";
import type { ReportTablePayload } from "./types";

/**
 * Yearly sales by calendar year (Jan–Dec) on issuedAt.
 * Same invoice universe as Daily / Monthly Sales.
 */
export async function computeYearlySalesReport(
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

  const { rows, totals } = bucketInvoicesByYear(invoices);

  return {
    kind: "table",
    columns: [
      { key: "year", label: "Year" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows,
    summary: {
      yearCount: rows.length,
      invoiceCount: totals.invoiceCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "invoice.issuedAt",
      periodBasis: "calendar year (Jan–Dec)",
    },
  };
}
