import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { bucketInvoicesByDay } from "./daily-sales-format";
import type { ReportTablePayload } from "./types";

/**
 * Daily sales by invoice issuedAt.
 * Same invoice universe as GST (excludes CANCELLED / VOID).
 */
export async function computeDailySalesReport(
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

  const { rows, totals } = bucketInvoicesByDay(invoices);

  return {
    kind: "table",
    columns: [
      { key: "date", label: "Date" },
      { key: "invoiceCount", label: "Invoices", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows,
    summary: {
      dayCount: rows.length,
      invoiceCount: totals.invoiceCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "invoice.issuedAt",
    },
  };
}
