import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import {
  paymentCollectionSource,
  sumPaymentCollectionAmounts,
} from "./payment-collection-format";
import type { ReportTablePayload } from "./types";

export { paymentCollectionSource, sumPaymentCollectionAmounts } from "./payment-collection-format";
export type { PaymentCollectionSource } from "./payment-collection-format";

export const PAYMENT_COLLECTION_ROW_LIMIT = 500;

export type PaymentCollectionRunOptions = {
  rowLimit?: number;
};

/**
 * Payment Collection: all customer Payments in the period (by paidAt).
 * Confirmed claims are included once via their linked Payment — never summed again from PaymentClaim.
 * Pending/rejected claims are excluded from collected totals (shown only as a count).
 */
export async function computePaymentCollectionReport(
  range: ParsedDateRange,
  runOptions?: PaymentCollectionRunOptions
): Promise<ReportTablePayload> {
  const rowLimit = runOptions?.rowLimit ?? PAYMENT_COLLECTION_ROW_LIMIT;
  const paymentWhere = {
    paidAt: { gte: range.from, lte: range.to },
  };

  const [totalMatching, payments, pendingClaimCount] = await Promise.all([
    prisma.payment.count({ where: paymentWhere }),
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { paidAt: "desc" },
      take: rowLimit,
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        mode: true,
        reference: true,
        paidAt: true,
        claimId: true,
        unallocatedAmount: true,
        customer: {
          select: {
            name: true,
            email: true,
            businessName: true,
          },
        },
        allocations: {
          select: {
            amount: true,
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
    }),
    prisma.paymentClaim.count({
      where: {
        status: "PENDING",
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
  ]);

  const money = (n: number) => Math.round(n * 100) / 100;
  const rows = payments.map((p) => {
    const customer =
      p.customer.businessName?.trim() ||
      p.customer.name?.trim() ||
      p.customer.email;
    const allocated = p.allocations.reduce(
      (s, a) => s + Number(a.amount),
      0
    );
    const invoices = p.allocations
      .map((a) => a.invoice.invoiceNumber)
      .filter(Boolean)
      .join(", ");
    return {
      paymentNumber: p.paymentNumber,
      customer,
      amount: money(Number(p.amount)),
      allocated: money(allocated),
      unallocated: money(Number(p.unallocatedAmount)),
      mode: p.mode,
      source: paymentCollectionSource(p.claimId),
      reference: p.reference ?? "",
      invoices: invoices || "—",
      paidAt: p.paidAt.toISOString(),
    };
  });

  const sums = sumPaymentCollectionAmounts(
    payments.map((p) => ({ amount: p.amount, claimId: p.claimId }))
  );

  return {
    kind: "table",
    columns: [
      { key: "paymentNumber", label: "Payment" },
      { key: "customer", label: "Customer" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "allocated", label: "Allocated", align: "right" },
      { key: "unallocated", label: "Unallocated", align: "right" },
      { key: "mode", label: "Mode" },
      { key: "source", label: "Source" },
      { key: "invoices", label: "Invoices" },
      { key: "paidAt", label: "Paid at" },
    ],
    rows,
    summary: {
      matchingCount: totalMatching,
      returnedCount: rows.length,
      totalCollected: sums.totalCollected,
      directAmount: sums.directAmount,
      claimLinkedAmount: sums.claimLinkedAmount,
      directCount: sums.directCount,
      claimLinkedCount: sums.claimLinkedCount,
      pendingClaimsInPeriod: pendingClaimCount,
      from: range.fromKey,
      to: range.toKey,
      dateBasis: "payment.paidAt",
      note: "Totals use Payment rows only; confirmed claims are not added twice.",
    },
    meta: {
      truncated: totalMatching > rows.length,
      rowLimit,
    },
  };
}
