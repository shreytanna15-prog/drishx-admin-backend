import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { bucketInvoicesByMonth } from "./monthly-sales-format";
import type { ReportTablePayload } from "./types";

export {
  bucketInvoicesByMonth,
  formatMonthKey,
} from "./monthly-sales-format";
export type { InvoiceSalesSlice } from "./monthly-sales-format";

/**
 * Monthly sales by invoice issuedAt (calendar months).
 * Same invoice universe as Daily Sales / GST (excludes CANCELLED / VOID).
 */
export async function computeMonthlySalesReport(
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

  const { rows, totals } = bucketInvoicesByMonth(invoices);

  return {
    kind: "table",
    columns: [
      { key: "month", label: "Month" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows,
    summary: {
      monthCount: rows.length,
      invoiceCount: totals.invoiceCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "invoice.issuedAt",
      monthBasis: "calendar YYYY-MM",
    },
  };
}
