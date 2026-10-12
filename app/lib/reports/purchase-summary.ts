import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { sumPurchaseBills } from "./purchase-aggregate-format";
import type { ReportCardsPayload } from "./types";

/**
 * Purchase Summary — period totals over the same PurchaseBill universe as
 * GST Summary input (billDate; excludes DRAFT / CANCELLED). Header amounts only.
 */
export async function computePurchaseSummaryReport(
  range: ParsedDateRange
): Promise<ReportCardsPayload> {
  const bills = await prisma.purchaseBill.findMany({
    where: {
      billDate: { gte: range.from, lte: range.to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: {
      taxableAmount: true,
      cgstAmount: true,
      sgstAmount: true,
      igstAmount: true,
      totalAmount: true,
    },
  });

  const totals = sumPurchaseBills(bills);

  return {
    kind: "cards",
    cards: [
      { label: "Bills", value: totals.billCount },
      { label: "Taxable purchases", value: totals.taxable },
      { label: "GST", value: totals.gst },
      { label: "Grand total", value: totals.total },
    ],
    columns: [
      { key: "billCount", label: "Bills", align: "right" },
      { key: "taxable", label: "Taxable", align: "right" },
      { key: "gst", label: "GST", align: "right" },
      { key: "total", label: "Grand total", align: "right" },
    ],
    rows:
      totals.billCount === 0
        ? []
        : [
            {
              billCount: totals.billCount,
              taxable: totals.taxable,
              gst: totals.gst,
              total: totals.total,
            },
          ],
    summary: {
      billCount: totals.billCount,
      taxable: totals.taxable,
      gst: totals.gst,
      total: totals.total,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "purchaseBill.billDate",
      statusFilter: "excludes DRAFT, CANCELLED",
    },
  };
}
